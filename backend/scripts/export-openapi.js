"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const swagger_1 = require("../src/swagger");
async function main() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { logger: ['error'] });
    app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });
    const document = (0, swagger_1.createOpenApiDocument)(app);
    (0, fs_1.mkdirSync)('openapi', { recursive: true });
    (0, fs_1.writeFileSync)('openapi/guardme-v1.json', JSON.stringify(document, null, 2));
    await app.close();
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=export-openapi.js.map