const http = require('http');
function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9229, path }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}
(async () => {
  const targets = await getJson('/json/list');
  console.log(targets.map((t) => ({ type: t.type, url: t.url, title: t.title, ws: t.webSocketDebuggerUrl })));
})();
