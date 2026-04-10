// ════════════════════════════════════════════════════════
//  DEZSTER — Confirmación de pago Flow.cl
//  Flow llama a esta función cuando el pago es confirmado
//  Netlify Function: /netlify/functions/confirmar-pago
// ════════════════════════════════════════════════════════

const crypto = require('crypto');
const https  = require('https');
const qs     = require('querystring');

const FLOW_API_KEY    = process.env.FLOW_API_KEY;
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY;

function firmar(params, secretKey) {
  const keys = Object.keys(params).sort();
  let cadena = '';
  keys.forEach(k => { cadena += k + params[k]; });
  return crypto.createHmac('sha256', secretKey).update(cadena).digest('hex');
}

function getEstadoPago(token) {
  return new Promise((resolve, reject) => {
    const params = {
      apiKey: FLOW_API_KEY,
      token:  token,
    };
    params.s = firmar(params, FLOW_SECRET_KEY);

    const query = qs.stringify(params);

    const options = {
      hostname: 'www.flow.cl',
      path:     '/api/payment/getStatus?' + query,
      method:   'GET',
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Respuesta inválida: ' + data)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async (event) => {

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'text/plain',
  };

  try {
    // Flow envía el token por POST
    const body  = qs.parse(event.body || '');
    const token = body.token;

    if (!token) {
      return { statusCode: 400, headers, body: 'Token no recibido' };
    }

    // Consultar estado del pago a Flow
    const estado = await getEstadoPago(token);

    // estado.status:
    //   1 = pendiente
    //   2 = pagado
    //   3 = rechazado
    //   4 = anulado

    if (estado.status === 2) {
      // ── PAGO EXITOSO ──
      // Aquí podrías guardar en una base de datos, enviar email, etc.
      console.log('PAGO EXITOSO:', {
        orden:    estado.commerceOrder,
        monto:    estado.amount,
        email:    estado.payer,
        opcional: estado.optional,
      });

      // Flow espera respuesta 200 con texto "OK" en menos de 15 segundos
      return { statusCode: 200, headers, body: 'OK' };

    } else {
      console.log('Pago NO completado, status:', estado.status);
      return { statusCode: 200, headers, body: 'OK' };
    }

  } catch (err) {
    console.error('Error en confirmación:', err);
    // Importante: devolver 200 de todas formas para que Flow no reintente
    return { statusCode: 200, headers, body: 'OK' };
  }
};
