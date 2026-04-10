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
    const siteUrl = process.env.SITE_URL || 'https://lustrous-kitten-2fc51b.netlify.app';

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
