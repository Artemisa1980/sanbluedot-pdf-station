/** Quita el prefijo técnico en inglés que Electron agrega a los errores del proceso principal
 *  ("Error invoking remote method 'station:…': Error: "), para mostrar solo el mensaje en español. */
export function cleanErrorText(message: string): string {
  return message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, "");
}
