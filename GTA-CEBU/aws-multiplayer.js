import server from './api/ws.js';

const port=Number(process.env.PORT)||8080;
const host=process.env.HOST||'0.0.0.0';

server.listen(port,host,()=>{
  console.log(`District Zero multiplayer listening on http://${host}:${port}`);
});

function shutdown(signal){
  console.log(`${signal} received; draining connections`);
  server.close(error=>process.exit(error?1:0));
  setTimeout(()=>process.exit(1),10000).unref();
}

process.on('SIGTERM',()=>shutdown('SIGTERM'));
process.on('SIGINT',()=>shutdown('SIGINT'));
