// ════════════════════════════════════════════════════════
//  DEZSTER — Función de pago con Flow.cl
//  Netlify Function: /netlify/functions/crear-pago
// ════════════════════════════════════════════════════════

const crypto = require('crypto');
const https  = require('https');
const qs     = require('querystring');

// ── Claves Flow (variables de entorno en Netlify) ──
const FLOW_API_KEY    = process.env.FLOW_API_KEY;
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY;
const FLOW_API_URL    = 'https://www.flow.cl/api';

// ── Firma requerida por Flow ──
function firmar(params, secretKey) {
  // Ordenar parámetros alfabéticamente
  const keys = Object.keys(params).sort();
  let cadena = '';
  keys.forEach(k => { cadena += k + params[k]; });
  return crypto
    .createHmac('sha256', secretKey)
    .update(cadena)
    .digest('hex');
}

// ── Llamada HTTPS a Flow ──
function llamarFlow(endpoint, params) {
  return new Promise((resolve, reject) => {
    params.apiKey    = FLOW_API_KEY;
    params.s         = firmar(params, FLOW_SECRET_KEY);

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
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Respuesta inválida de Flow: ' + data)); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
// ════════════════════════════════════════════════════════
exports.handler = async (event) => {

  // Solo POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  // Headers CORS
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // ── Leer datos del carrito enviados desde el HTML ──
    const { items, email, nombre } = JSON.parse(event.body || '{}');

    if (!items || items.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Carrito vacío' }),
      };
    }

    // ── Calcular total en CLP (entero, sin decimales) ──
    // Los precios vienen como "24.990" (string chileno) → convertir a número
    const total = items.reduce((sum, item) => {
      const precio = parseInt(String(item.price).replace(/\./g, ''), 10);
      return sum + precio;
    }, 0);

    // Flow requiere mínimo $350 CLP
    if (total < 350) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'El monto mínimo es $350 CLP' }),
      };
    }

    // ── Construir descripción del pedido ──
    const descripcion = items
      .map(i => `${i.name} (Talla ${i.size})`)
      .join(' + ');

    // ── ID único de orden ──
    const comercioOrden = 'DZS-' + Date.now();

    // ── URL base del sitio (donde está alojado) ──
    const siteUrl = process.env.URL || 'https://dezsterchile.netlify.app';

    // ── Parámetros para Flow payment/create ──
    const params = {
      commerceOrder: comercioOrden,
      subject:       'Pedido Dezster Chile',
      currency:      'CLP',
      amount:        String(total),
      email:         email || 'cliente@dezsterchile.cl',
      paymentMethod: '9',          // 9 = todos los métodos (Webpay, débito, etc.)
      urlConfirmation: siteUrl + '/.netlify/functions/confirmar-pago',
      urlReturn:       siteUrl + '/gracias.html',
      optional: JSON.stringify({
        nombre:      nombre || 'Cliente',
        productos:   descripcion,
        whatsapp:    '56966942574',
      }),
    };

    // ── Llamar a Flow ──
    const respuesta = await llamarFlow('payment/create', params);

    if (!respuesta.url || !respuesta.token) {
      console.error('Error Flow:', respuesta);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Error al crear el pago en Flow',
          detalle: respuesta,
        }),
      };
    }

    // ── Devolver URL de pago al navegador ──
    // El cliente será redirigido a esta URL para pagar
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        urlPago: respuesta.url + '?token=' + respuesta.token,
        orden:   comercioOrden,
        total:   total,
      }),
    };

  } catch (err) {
    console.error('Error interno:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno del servidor', detalle: err.message }),
    };
  }
};
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
