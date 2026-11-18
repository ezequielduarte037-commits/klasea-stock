import { admin, must } from '../tmp/jacuzzi-client.mjs';
const c = await must(admin.from('request_comments').select('*,author:profiles!request_comments_author_id_fkey(username)').eq('request_id','943950cc-94fb-48a9-b83b-8ad5c30e878a').order('created_at'));
console.log(JSON.stringify(c.map(x=>({at:x.created_at,who:x.author?.username,body:x.body??x.content??x.text,att:x.attachments})),null,1));
