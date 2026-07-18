using System.Collections.Concurrent;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using PCSC;
using PCSC.Iso7816;
using PCSC.Monitoring;

namespace KlaseaNfcBridge;

/// <summary>
/// Puente entre el lector NFC PC/SC (ACS ACR122U) y la app web klasea-stock.
///
/// El ACR122U NO emula teclado: es un lector PC/SC, asi que el navegador no puede
/// leerlo directo. Este proceso lo escucha por PC/SC y publica el UID de cada
/// tarjeta por WebSocket local, que es lo que ya espera `useNfcBridge` en la app.
///
///   WebSocket : ws://127.0.0.1:17777/nfc
///   Health    : http://127.0.0.1:17777/health
///
/// No toca Supabase ni guarda nada: solo emite el UID. La web resuelve el empleado.
/// </summary>
internal static class Program
{
    private const int Puerto = 17777;

    // Si la tarjeta queda apoyada, el lector reporta la misma lectura muchas veces.
    private static readonly TimeSpan Debounce = TimeSpan.FromMilliseconds(1200);

    private static readonly ConcurrentDictionary<Guid, WebSocket> Clientes = new();

    private static string _lectorActual = "";
    private static string _ultimoUid = "";
    private static DateTime _ultimoUidAt = DateTime.MinValue;

    private static async Task<int> Main()
    {
        Console.Title = "Klasea · Puente NFC";
        Banner();

        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

        HttpListener listener;
        try
        {
            listener = new HttpListener();
            listener.Prefixes.Add($"http://127.0.0.1:{Puerto}/");
            listener.Start();
        }
        catch (HttpListenerException ex)
        {
            Error($"No se pudo abrir el puerto {Puerto}.");
            Error(ex.Message);
            Console.WriteLine();
            Console.WriteLine("Suele ser porque ya hay otra copia del puente corriendo.");
            Console.WriteLine("Cerrala (o revisa con: netstat -ano | findstr 17777) y volve a intentar.");
            Console.WriteLine();
            Console.WriteLine("Enter para salir...");
            Console.ReadLine();
            return 1;
        }

        Ok($"Escuchando en http://127.0.0.1:{Puerto}");
        Console.WriteLine($"   WebSocket : ws://127.0.0.1:{Puerto}/nfc");
        Console.WriteLine($"   Health    : http://127.0.0.1:{Puerto}/health");
        Console.WriteLine();

        var web = Task.Run(() => LoopWeb(listener, cts.Token), cts.Token);
        var nfc = Task.Run(() => LoopLector(cts.Token), cts.Token);

        Console.WriteLine("Apoya una tarjeta sobre el lector para probar. Ctrl+C para salir.");
        Console.WriteLine();

        try { await Task.WhenAny(web, nfc); }
        catch (OperationCanceledException) { /* salida normal */ }

        listener.Close();
        return 0;
    }

    /* ── Lector PC/SC ──────────────────────────────────────────────────────── */

    /// <summary>
    /// Busca el lector y se queda escuchando. Si no hay lector (o se desenchufa)
    /// reintenta para siempre en vez de morirse: la PC del panol se prende antes
    /// que el lector mas de una vez.
    /// </summary>
    private static async Task LoopLector(CancellationToken ct)
    {
        var avisoSinLector = false;

        while (!ct.IsCancellationRequested)
        {
            string[] lectores;
            try
            {
                using var ctx = ContextFactory.Instance.Establish(SCardScope.System);
                lectores = ctx.GetReaders();
            }
            catch (Exception ex)
            {
                Error($"No se pudo hablar con el servicio de tarjetas: {ex.Message}");
                Console.WriteLine("   Revisa que el servicio 'Smart Card' (SCardSvr) este iniciado.");
                await Task.Delay(4000, ct);
                continue;
            }

            if (lectores.Length == 0)
            {
                if (!avisoSinLector)
                {
                    Warn("No se detecta ningun lector. Enchufa el ACR122U...");
                    avisoSinLector = true;
                    _lectorActual = "";
                }
                await Task.Delay(2500, ct);
                continue;
            }

            avisoSinLector = false;
            // Preferimos el ACS si hay varios lectores conectados.
            var lector = Array.Find(lectores, r => r.Contains("ACR122", StringComparison.OrdinalIgnoreCase))
                         ?? Array.Find(lectores, r => r.Contains("ACS", StringComparison.OrdinalIgnoreCase))
                         ?? lectores[0];

            if (lector != _lectorActual)
            {
                _lectorActual = lector;
                Ok($"Lector detectado: {lector}");
            }

            try
            {
                await EscucharLector(lector, ct);
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                Warn($"Se corto la conexion con el lector: {ex.Message}");
                _lectorActual = "";
                await Task.Delay(2000, ct);
            }
        }
    }

    private static async Task EscucharLector(string lector, CancellationToken ct)
    {
        using var monitor = MonitorFactory.Instance.Create(SCardScope.System);
        // El contexto se establece UNA vez y se reusa: abrirlo en cada lectura
        // tardaba tanto que si levantabas la tarjeta rapido, al ir a leer el UID
        // la tarjeta ya no estaba ("The smart card has been removed").
        using var ctx = ContextFactory.Instance.Establish(SCardScope.System);
        var tcs = new TaskCompletionSource();

        void OnInsertada(object sender, CardStatusEventArgs e) => ProcesarTarjeta(ctx, lector);

        monitor.CardInserted += OnInsertada;
        // Si el monitor se cae (USB desenchufado), salimos para que el loop de
        // afuera vuelva a buscar el lector desde cero.
        monitor.MonitorException += (_, __) => tcs.TrySetResult();

        monitor.Start(lector);

        using (ct.Register(() => tcs.TrySetResult()))
        {
            await tcs.Task;
        }

        monitor.CardInserted -= OnInsertada;
        monitor.Cancel();
        ct.ThrowIfCancellationRequested();
    }

    /// <summary>
    /// Lee el UID con la APDU estandar FF CA 00 00 00 y lo publica.
    ///
    /// Reintenta un par de veces: entre que salta el evento y llegamos a hablarle
    /// a la tarjeta pasan unos milisegundos, y con un apoyo rapido la tarjeta ya
    /// se fue. Si igual no llega, avisamos que la mantenga apoyada.
    /// </summary>
    private static void ProcesarTarjeta(ISCardContext ctx, string lector)
    {
        const int intentos = 4;
        for (var i = 1; i <= intentos; i++)
        {
            try
            {
                LeerYPublicar(ctx, lector);
                return;
            }
            catch (Exception ex) when (EsTarjetaAusente(ex))
            {
                if (i == intentos)
                {
                    Warn("No llegue a leer la tarjeta. Mantenela apoyada un segundo mas.");
                    return;
                }
                Thread.Sleep(120);
            }
            catch (Exception ex)
            {
                Warn($"No se pudo leer la tarjeta: {ex.Message}");
                return;
            }
        }
    }

    /// <summary>Errores que significan "la tarjeta ya no esta" y ameritan reintento.</summary>
    private static bool EsTarjetaAusente(Exception ex)
    {
        var m = ex.Message;
        return m.Contains("removed", StringComparison.OrdinalIgnoreCase)
            || m.Contains("no smart card", StringComparison.OrdinalIgnoreCase)
            || m.Contains("retirada", StringComparison.OrdinalIgnoreCase)
            || m.Contains("reset", StringComparison.OrdinalIgnoreCase);
    }

    private static void LeerYPublicar(ISCardContext ctx, string lector)
    {
        {
            using var iso = new IsoReader(ctx, lector, SCardShareMode.Shared, SCardProtocol.Any, false);

            var apdu = new CommandApdu(IsoCase.Case2Short, iso.ActiveProtocol)
            {
                CLA = 0xFF, INS = 0xCA, P1 = 0x00, P2 = 0x00, Le = 0,
            };

            var resp = iso.Transmit(apdu);
            if (resp.SW1 != 0x90 || resp.SW2 != 0x00)
            {
                Warn($"La tarjeta respondio {resp.SW1:X2}{resp.SW2:X2} (no se pudo leer el UID).");
                return;
            }

            var datos = resp.GetData();
            if (datos is null || datos.Length == 0)
            {
                Warn("La tarjeta no devolvio UID.");
                return;
            }

            var uid = Convert.ToHexString(datos); // mayusculas, sin separadores

            // Tarjeta apoyada = lecturas repetidas. Publicamos una sola.
            var ahora = DateTime.UtcNow;
            if (uid == _ultimoUid && (ahora - _ultimoUidAt) < Debounce) return;
            _ultimoUid = uid;
            _ultimoUidAt = ahora;

            var json = JsonSerializer.Serialize(new
            {
                type = "card",
                uid,
                reader = lector,
                at = ahora.ToString("o"),
            });

            Ok($"Tarjeta {uid}  →  {Clientes.Count} cliente(s)");
            _ = Difundir(json);
        }
    }

    /* ── WebSocket + HTTP ──────────────────────────────────────────────────── */

    private static async Task LoopWeb(HttpListener listener, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            HttpListenerContext ctx;
            try { ctx = await listener.GetContextAsync(); }
            catch (Exception) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex) { Warn($"HTTP: {ex.Message}"); continue; }

            _ = Task.Run(() => Atender(ctx, ct), ct);
        }
    }

    private static async Task Atender(HttpListenerContext ctx, CancellationToken ct)
    {
        var ruta = ctx.Request.Url?.AbsolutePath ?? "/";

        if (ruta.Equals("/nfc", StringComparison.OrdinalIgnoreCase) && ctx.Request.IsWebSocketRequest)
        {
            var ws = (await ctx.AcceptWebSocketAsync(null)).WebSocket;
            var id = Guid.NewGuid();
            Clientes[id] = ws;
            Ok($"Cliente conectado ({Clientes.Count} en total)");
            await MantenerVivo(id, ws, ct);
            return;
        }

        if (ruta.Equals("/health", StringComparison.OrdinalIgnoreCase))
        {
            var cuerpo = JsonSerializer.Serialize(new
            {
                ok = true,
                reader = _lectorActual,
                connected = !string.IsNullOrEmpty(_lectorActual),
                clients = Clientes.Count,
                lastUid = _ultimoUid,
            });
            await Responder(ctx, 200, "application/json", cuerpo);
            return;
        }

        await Responder(ctx, 404, "text/plain", "Klasea NFC bridge. Usa /nfc (WebSocket) o /health.");
    }

    private static async Task Responder(HttpListenerContext ctx, int codigo, string tipo, string cuerpo)
    {
        try
        {
            var bytes = Encoding.UTF8.GetBytes(cuerpo);
            ctx.Response.StatusCode = codigo;
            ctx.Response.ContentType = tipo;
            // La app corre en el navegador (otro origen), asi que hace falta CORS.
            ctx.Response.AddHeader("Access-Control-Allow-Origin", "*");
            ctx.Response.ContentLength64 = bytes.Length;
            await ctx.Response.OutputStream.WriteAsync(bytes);
            ctx.Response.Close();
        }
        catch { /* el cliente corto antes de tiempo */ }
    }

    /// <summary>Mantiene el socket abierto hasta que el cliente se va.</summary>
    private static async Task MantenerVivo(Guid id, WebSocket ws, CancellationToken ct)
    {
        var buffer = new byte[256];
        try
        {
            while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var r = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
                if (r.MessageType == WebSocketMessageType.Close) break;
            }
        }
        catch { /* desconexion abrupta: es normal al cerrar el navegador */ }
        finally
        {
            Clientes.TryRemove(id, out _);
            try { ws.Dispose(); } catch { }
            Info($"Cliente desconectado ({Clientes.Count} quedan)");
        }
    }

    private static async Task Difundir(string json)
    {
        var bytes = Encoding.UTF8.GetBytes(json);
        foreach (var (id, ws) in Clientes)
        {
            if (ws.State != WebSocketState.Open)
            {
                Clientes.TryRemove(id, out _);
                continue;
            }
            try
            {
                await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
            }
            catch
            {
                Clientes.TryRemove(id, out _);
            }
        }
    }

    /* ── Consola ───────────────────────────────────────────────────────────── */

    private static void Banner()
    {
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine();
        Console.WriteLine("  KLASEA · Puente NFC (ACR122U → navegador)");
        Console.ResetColor();
        Console.WriteLine("  ----------------------------------------");
        Console.WriteLine();
    }

    private static void Ok(string m) => Escribir(m, ConsoleColor.Green, "OK  ");
    private static void Warn(string m) => Escribir(m, ConsoleColor.Yellow, "!   ");
    private static void Error(string m) => Escribir(m, ConsoleColor.Red, "ERR ");
    private static void Info(string m) => Escribir(m, ConsoleColor.Gray, "    ");

    private static void Escribir(string mensaje, ConsoleColor color, string prefijo)
    {
        Console.ForegroundColor = color;
        Console.WriteLine($"{prefijo}[{DateTime.Now:HH:mm:ss}] {mensaje}");
        Console.ResetColor();
    }
}
