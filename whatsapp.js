/**
 * Integración con Meta API (WhatsApp Business)
 * Este es un módulo preparado para el futuro, que enviará notificaciones por WhatsApp.
 * Requiere configurar una App en Meta for Developers, obtener Token de Acceso y un Phone Number ID.
 */

const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

/**
 * Función para enviar mensaje vía WhatsApp.
 * @param {string} telefono - Teléfono del cliente con código de país (ej: '5491100000000')
 * @param {string} mensaje - El texto a enviar, o en el futuro un identificador de plantilla (template)
 */
async function enviarMensajeWhatsApp(telefono, mensaje) {
  if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_ID) {
    console.log('[WhatsApp Stub] No hay credenciales configuradas. Mensaje no enviado a:', telefono);
    return false;
  }

  // Ejemplo de implementación real comentada:
  /*
  try {
    const response = await fetch(`https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'text', // o 'template'
        text: {
          body: mensaje
        }
      })
    });
    
    if (response.ok) {
      console.log(`[WhatsApp] Mensaje enviado a ${telefono}`);
      return true;
    } else {
      console.error('[WhatsApp] Error en API Meta:', await response.text());
      return false;
    }
  } catch (error) {
    console.error('[WhatsApp] Fallo de red:', error);
    return false;
  }
  */
  
  // Mientras no esté activo en prod, simplemente lo dejamos en log:
  console.log(`[WhatsApp Stub] Simulación de envío a ${telefono}: "${mensaje}"`);
  return true;
}

module.exports = {
  enviarMensajeWhatsApp
};
