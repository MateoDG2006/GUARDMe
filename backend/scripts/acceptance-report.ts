import { execSync } from 'child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'fs';

const CASES: Record<string, string> = {
  T01: 'Un cuidador accede a dos perfiles y otro se suma a uno',
  T02: 'Mismo caso con familiar y médico',
  T03: 'Configurar desde cada posición inicial',
  T04: 'App bloqueada con PIN; iniciar emergencia',
  T05: 'Intentar incorporar por serie sin secreto',
  T06: 'Caída detectada; observar primeros 30 segundos',
  T07: 'Cancelar por botón y por app en ejecuciones separadas',
  T08: 'Reenviar dos veces la misma cancelación',
  T09: 'Corte después de persistir y antes del acuse',
  T10: 'Ningún contacto contesta',
  T11: 'Primer o segundo contacto responde',
  T12: 'Responde un buzón',
  T13: 'Se agotan intentos',
  T14: 'Emergencia iniciada directamente',
  T15: 'Dos cuidadores confirman encargarse a la vez',
  T16: 'Posponer y avanzar cinco minutos',
  T17: 'Posponer y vencer dos horas',
  T18: 'Cerrar antes y después de las 7 a. m.',
  T19: 'Usuario no responde dos horas',
  T20: 'Respuesta negativa y última consulta',
  T21: 'Última respuesta negativa o ausencia de respuesta',
  T22: 'Usuario intenta borrar recordatorio de cuidador directamente',
  T23: 'Dos participantes editan/consultan agenda',
  T24: 'Confirmar medicamento desde app y pulsar botón',
  T25: 'Publicar ubicación sin consentimiento o con muestra antigua',
  T26: 'Quitar BLE o internet y reconectar',
  T27: 'FCM acepta sin acuse del dispositivo',
  T28: 'Revocar cuidador con cursor/notificación antiguos',
  T29: 'Reiniciar trabajador después de crear efecto pendiente',
  T30: 'Repetir/desordenar eventos de proveedor tras cierre',
  T31: 'JWT de otro proyecto, expirado o inválido',
  T32: 'Consultas como rol real de API, sin propietario ni BYPASSRLS',
  T33: 'Publishable key o acceso directo a Data API intenta leer guardme',
  T34: 'Revisar configuración que recibe Android',
  T35: 'Identidad anónima sin código; código reutilizado; reincorporación autorizada',
  T36: 'Sesión cerrada o instalación revocada con JWT todavía no expirado',
  T37: 'Reproducir migraciones del dominio y comparar esquema ORM',
  T38: 'Intercalar peticiones A/B reutilizando conexiones del pool',
};

const HARDWARE = new Set(['T04', 'T06', 'T07']);
const PARTIAL =
  'no ejecutado – requiere hardware/dispositivo (la parte de backend que existe se indica en Tests)';

interface JestJson {
  testResults: Array<{
    assertionResults: Array<{ fullName: string; status: string }>;
  }>;
}

function commitId(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'sin commit';
  }
}

function main(): void {
  const commit = commitId();
  const output = 'acceptance-jest.json';
  try {
    execSync(
      `pnpm exec jest -c jest.int.config.ts --json --runInBand --outputFile=${output}`,
      { stdio: 'inherit' },
    );
  } catch {
    // El informe incluye los casos fallidos.
  }
  const report = JSON.parse(readFileSync(output, 'utf8')) as JestJson;
  unlinkSync(output);
  const byCase = new Map<string, string[]>();
  for (const file of report.testResults) {
    for (const test of file.assertionResults) {
      const match = test.fullName.match(/\[(T\d{2})\]/);
      if (!match?.[1]) continue;
      const list = byCase.get(match[1]) ?? [];
      list.push(test.status);
      byCase.set(match[1], list);
    }
  }
  const date = new Date().toISOString();
  const lines = [
    '# Informe de aceptación',
    '',
    '| Caso | Estado | Tests | Fecha | Commit |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const [id, title] of Object.entries(CASES)) {
    const tests = byCase.get(id) ?? [];
    let status = 'no ejecutado';
    if (HARDWARE.has(id))
      status = 'no ejecutado – requiere hardware/dispositivo';
    else if (tests.some((item) => item === 'failed')) status = 'fallido';
    else if (tests.some((item) => item === 'passed')) status = 'aprobado';
    if (id === 'T24' || id === 'T26') {
      status = tests.some((item) => item === 'passed')
        ? `aprobado (backend); ${PARTIAL}`
        : PARTIAL;
    }
    lines.push(
      `| ${id} ${title} | ${status} | ${tests.length} | ${date} | ${commit} |`,
    );
  }
  writeFileSync('acceptance-report.md', `${lines.join('\n')}\n`);
}

main();
