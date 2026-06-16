-- ===== FIX asignacion contratistas (jefe = fila AMARILLA del Excel) =====
-- 1) Alta de contratistas faltantes (por DNI)
insert into rrhh_contratistas (nombre, dni, celular) values
  ('Abadie Daniel', '31988009', '1130164829'),
  ('Boria Chafa', '24024846', '1128437650'),
  ('Centurion Ariel', '94453624', '1130098835'),
  ('Centurion Matias', '34352180', '1127346417'),
  ('Curatitoli Damian', '26532747', '1134740510'),
  ('De Souza Federico', '28255245', '1157046528'),
  ('Frias Luis Gabriel', '43521967', NULL),
  ('Frias Luis Manuel', '31634975', '1133245139'),
  ('Fritz Leonerdo', '21672560', '1158800661'),
  ('Galeano Juan Carlos', '16866093', '1158411692'),
  ('Gonzalez Juan', '20628415', '1133205561'),
  ('Gonzalez Juan', '34155271', '1170183555'),
  ('Juarez Mario', '26325945', '1138932674'),
  ('Lois Carlos', '47071647', '1156939653'),
  ('Lopez Hernan', '30183063', '1140868215'),
  ('Mateo Fernando', '21956031', '1136269619'),
  ('Montesano Mariano', '29500781', '1157616767'),
  ('Parada Pablo', '23442889', NULL),
  ('Parada Pablo', '21582387', '1128719724'),
  ('Pineda Sebastian', '29489712', '1169748753'),
  ('Privitello Emiliano', '31846981', '1168773457'),
  ('Ramirez Gabriel', '28046196', '1170981856'),
  ('Ramirez Mariano', '33933845', '1165248182'),
  ('Roman Damian', '29171322', '1163375526'),
  ('Sertc Jorge', '27333852', '1162608214'),
  ('Zapata Jorge', '30723438', '1158646991')
on conflict (dni) do nothing;

-- 2) Reset: todos a CASA (sin tocar sede / ficha / activo)
update rrhh_empleados set grupo='casa', contratista_id=null;

-- 3) Asignar cada empleado (por DNI) a su contratista
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='31988009') where dni in ('27433963','29054515','31988009','42832225','45992931','46811038','47162553');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='24024846') where dni in ('17296726','18165210','20315535','22497259','23268137','23442950','24024846','24631855','26040827','28683898','29932817','30412975','40550315','41722903','43908194');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='94453624') where dni in ('45465780','45518831','46202812','94453624');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='34352180') where dni in ('31811488','34352180');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='26532747') where dni in ('23268296','26532747','26765765','28045442','28329365','29489646','32636483','44667005','45571843');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='28255245') where dni in ('28255245','34835880','35341355');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='43521967') where dni in ('14755551','27604604','33245509','33391296','36402949','43383659','43521967','44340212','45896972','46023363','48765368');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='31634975') where dni in ('31634975');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='21672560') where dni in ('21672560');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='16866093') where dni in ('16866093','21462623','26853308','35424054','36624142','38921066','41955849','45204429','48168443');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='20628415') where dni in ('18110738','18559496','20628415','23862311','27156126','35416501','38920880','40743970','41133610','42237536','42237592');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='34155271') where dni in ('34155271');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='26325945') where dni in ('21494753','26325945','28880636','28880845','31348752','33405172','36624183','38671866','41924897','42879781','46186292','47338599','47787375');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='47071647') where dni in ('44381500','47071647');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='30183063') where dni in ('28706550','30183063','31503462','31702434','32469316','32644665','32731973','35987403','36560875','36942432','37539096','38009615','38255902','38659243','38920432','39515473','45840134','46347462','47384734','95944505');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='21956031') where dni in ('17984620','21956031','24195067','47940807');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='29500781') where dni in ('27375650','28359466','29500781','44449049','45813686','46736061','93433451');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='23442889') where dni in ('14129076','21582387','22689634','23442889','28500828','37341293','38825988','40251696','41213488','42092667','47753315');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='29489712') where dni in ('26063955','26911272','29489712','30512997','31630976','46015223','47395156');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='31846981') where dni in ('31846981','47191985','47647876');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='28046196') where dni in ('13900872','22393429','26008597','28046196','28189361','29183103','29589025','31551367','45465892','47184193');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='33933845') where dni in ('32765259','33933845','34234912','40251743','48981111');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='29171322') where dni in ('22555725','29171322','29489497');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='27333852') where dni in ('22148047','22393163','27333852','32469235','32644184');
update rrhh_empleados set grupo='contratista', contratista_id=(select id from rrhh_contratistas where dni='30723438') where dni in ('30241594','30723438','46902495');