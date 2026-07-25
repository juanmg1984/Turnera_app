const http = require('http');

function req(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 8642,
      path,
      method,
      headers: {}
    };
    if (token) opts.headers['Cookie'] = `token=${token}`;
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
    }
    const req = http.request(opts, (res) => {
      let d = '';
      res.on('data', c => d+=c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d), headers: res.headers }); }
        catch (e) { resolve({ status: res.statusCode, data: d, headers: res.headers }); }
      });
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log("1. Logging in as demo...");
  let r = await req('/api/auth/login', 'POST', { email: 'demo@americanjet.demo', password: 'demo' });
  const cookie = r.headers['set-cookie'][0];
  const token = cookie.match(/sesion=([^;]+)/)[1];
  console.log("Token:", token.substring(0, 10));

  console.log("\n2. Getting my aeronaves (should be empty initially because no linking was done)...");
  r = await req('/api/aeronaves', 'GET', null, token);
  console.log("My aeronaves count:", r.data.length);

  const testMat = 'LV-HQR';
  console.log(`\n3. Linking aircraft ${testMat}...`);
  r = await req('/api/usuario_aeronaves', 'POST', { matricula: testMat }, token);
  console.log("Link response:", r.status, r.data);

  console.log("\n4. Getting my aeronaves again (should contain LV-HQR)...");
  r = await req('/api/aeronaves', 'GET', null, token);
  console.log("My aeronaves count:", r.data.length);
  if (r.data.length) console.log("First aircraft:", r.data[0].matricula);

  console.log(`\n5. Creating a turno for ${testMat}...`);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  r = await req('/api/turnos', 'POST', { 
    matricula: testMat, 
    fecha: tomorrow, 
    hora: '14:00',
    volumen: 100,
    forma_pago: 'EFECTIVO'
  }, token);
  console.log("Turno response:", r.status, r.data);
}

run().catch(console.error);
