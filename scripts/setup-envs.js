const fs = require('fs');
const path = require('path');

const apps = [
    'apps/web',
    'apps/tunnel',
    'apps/cron',
    'apps/internal-check'
];

apps.forEach(appDir => {
    const examplePath = path.join(appDir, '.env.example');
    const envPath = path.join(appDir, '.env');

    if (fs.existsSync(examplePath)) {
        if (!fs.existsSync(envPath)) {
            fs.copyFileSync(examplePath, envPath);
            console.log(`✅ Created .env for ${appDir}`);
        } else {
            console.log(`ℹ️  .env already exists for ${appDir}, skipping.`);
        }
    }
});

console.log('✨ Environment variable setup complete!');
