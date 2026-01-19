const { Launch, Microsoft } = require('minecraft-java-core');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const https = require('https');
const env = require('dotenv').config().parsed;

const { app, BrowserWindow } = require('electron'); // Ajoutez 'app' ici
const launcher = new Launch();
const gamePath = path.join(app.getPath('userData'), 'nexus-minecraft');

// Empêcher l'application de se fermer quand la fenêtre d'auth se ferme
app.on('window-all-closed', (e) => {
    e.preventDefault();
});

// Fonction personnalisée pour télécharger le ZIP sans erreur
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Échec du téléchargement : ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

async function startProject() {
    if (!fs.existsSync(gamePath)) fs.mkdirSync(gamePath, { recursive: true });

    if (!env.ZIP_URL || !env.HASH_URL) {

        const zipUrl = env.ZIP_URL;
        const hashUrl = env.HASH_URL;
        const zipPath = path.join(__dirname, 'temp-modpack.zip');
        const localHashPath = path.join(__dirname, 'last_hash.txt');

        console.log("=== Système de Mise à jour ===");

        try {
            const response = await fetch(hashUrl);
            const remoteHash = (await response.text()).trim();
            let localHash = fs.existsSync(localHashPath) ? fs.readFileSync(localHashPath, 'utf8').trim() : "";

            if (remoteHash !== localHash) {
                console.log("✨ Nouvelle mise à jour détectée !");

                console.log("📥 Téléchargement du pack (Archive.zip)...");
                await downloadFile(zipUrl, zipPath); // Utilisation de notre nouvelle fonction

                console.log("📦 Extraction des fichiers...");
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(gamePath, true);

                fs.writeFileSync(localHashPath, remoteHash);
                if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
                console.log("✅ Mise à jour terminée !");
            } else {
                console.log("✅ Le modpack est déjà à jour.");
            }
        } catch (error) {
            console.error("⚠️ Erreur mise à jour :", error.message);
            console.log("🚀 Lancement avec les fichiers actuels...");
        }

    } else {
        console.error("❌ Erreur : Le serveur n'est pas encore démarré, vous ne pouvez télécharger que le jeu de base.");
    }

    // --- Authentification ---
    let mc;
    const accountFile = './account.json';
    console.log("🔑 Début de la phase d'authentification...");

    try {
        if (!fs.existsSync(accountFile)) {
            console.log("🌐 Ouverture de la fenêtre de connexion Microsoft...");
            const ms = new Microsoft();
            mc = await ms.getAuth('electron');

            if (!mc) throw new Error("L'authentification a été annulée.");

            fs.writeFileSync(accountFile, JSON.stringify(mc, null, 4));
            console.log("✅ Nouveau compte enregistré.");
        } else {
            console.log("🔄 Récupération du compte local...");
            mc = JSON.parse(fs.readFileSync(accountFile));
            // Tentative de refresh
            mc = mc.refresh_token ? await new Microsoft().refresh(mc) : await new Microsoft().getAuth('electron');
            fs.writeFileSync(accountFile, JSON.stringify(mc, null, 4));
        }

        console.log(`👤 Connecté en tant que : ${mc.name}`);

        // --- Lancement du jeu ---
        const opt = {
            path: gamePath,
            authenticator: mc,
            version: '1.21.1',
            loader: { type: 'neoforge', build: 'latest', enable: true },
            memory: { min: '4G', max: '8G' }
        };

        console.log("🎮 Préparation de Minecraft...");
        launcher.Launch(opt);

        launcher.on('progress', (progress, size) => {
            const percent = ((progress / size) * 100).toFixed(2);
            process.stdout.write(`\r[Installation Assets] ${percent}%`);
        });
        launcher.on('data', line => process.stdout.write(line));
        launcher.on('error', err => console.error("\n❌ Erreur Launcher :", err));

    } catch (error) {
        console.error("❌ Erreur critique :", error.message);
        app.quit(); // On quitte seulement en cas d'erreur réelle
    }
}

// Lancer le projet uniquement quand Electron est prêt
app.whenReady().then(() => {
    startProject();
});