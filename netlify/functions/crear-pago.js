// ════════════════════════════════════════════════════════
//  DEZSTER — Función de pago con Flow.cl
//  Netlify Function: /netlify/functions/crear-pago
// ════════════════════════════════════════════════════════

const crypto = require('crypto');
const https  = require('https');
const qs     = require('querystring');

const FLOW_API_KEY    = process.env.FLOW_API_KEY;
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY;

// ── Firma HMAC-SHA256 requerida por Flow ──
function firmar(params, secretKey) {
  const keys   = Object.keys(params).sort();
  let   cadena = '';
  keys.forEach(k => { cadena += k + params[k]; });
  return crypto.createHmac('sha256', secretKey).update(cadena).digest('hex');
}

// ── Llamada POST a la API de Flow ──
function llamarFlow(endpoint, params) {
  return new Promise((resolve, reject) => {
    params.apiKey = FLOW_API_KEY;
    params.s      = firmar(params, FLOW_SECRET_KEY);

    const body = qs.stringify(params);

    const options = {
      hostname: 'www.flow.cl',
      path:     '/api/' + endpoint,
      method:   'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        console.log('Flow respuesta raw:', data);
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Flow respuesta no es JSON: ' + data));
        }
      });
    });

    req.on('error', (err) => {
      console.error('Error conexion Flow:', err.message);
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {

  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Metodo no permitido' }) };
  }

  if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
    console.error('FALTAN VARIABLES DE ENTORNO: FLOW_API_KEY o FLOW_SECRET_KEY');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Configuracion incompleta: faltan claves de Flow' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { items, email, nombre, envio } = body;

    console.log('Items recibidos:', JSON.stringify(items));
    console.log('Email:', email);

    if (!items || items.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Carrito vacio' }) };
    }

    const total = items.reduce((sum, item) => {
      const precio = parseInt(String(item.price).replace(/\./g, ''), 10);
      return sum + precio;
    }, 0);

    console.log('Total CLP:', total);

    if (total < 350) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Monto minimo es $350 CLP' }) };
    }

    const descripcion = items
      .map(i => i.name + ' T:' + i.size)
      .join(', ')
      .substring(0, 200);

    const comercioOrden = 'DZS-' + Date.now();
    const siteUrl = process.env.SITE_URL || 'https://lustrous-kitten-2fc51b.netlify.app';

    const params = {
      commerceOrder:   comercioOrden,
      subject:         'Pedido Dezster Chile',
      currency:        'CLP',
      amount:          String(total),
      email:           email || 'cliente@dezsterchile.cl',
      paymentMethod:   '9',
      urlConfirmation: siteUrl + '/.netlify/functions/confirmar-pago',
      urlReturn:       siteUrl + '/gracias.html',
    };

    console.log('Params enviados a Flow:', JSON.stringify(params));

    const respuesta = await llamarFlow('payment/create', params);

    console.log('Respuesta completa Flow:', JSON.stringify(respuesta));

    if (respuesta.code) {
      console.error('Flow codigo error:', respuesta.code, respuesta.message);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Flow rechazo: ' + (respuesta.message || 'Error ' + respuesta.code),
          codigo: respuesta.code,
        }),
      };
    }

    if (!respuesta.url || !respuesta.token) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Flow no devolvio URL de pago', detalle: respuesta }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        urlPago: respuesta.url + '?token=' + respuesta.token,
        orden:   comercioOrden,
        total,
      }),
    };

  } catch (err) {
    console.error('Error interno:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno: ' + err.message }),
    };
  }
};
