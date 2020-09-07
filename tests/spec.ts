import path from 'path';
import os from 'os';
import fs from 'fs';
import {expect} from 'chai';
import {Application} from 'spectron';
import electron from 'electron';

interface This extends Mocha.Context {
    app: Application
}

if (process.env.BUILD_ZCOIN_CLIENT !== 'false') {
    before(async function () {
        this.timeout(1000e3); // Make sure we have enough time to build our app.
        await require('../electron-vue/build');
    });
}

describe('Regtest with New Wallet', function (this: Mocha.Suite) {
    this.slow(500);

    this.beforeAll(async function (this: This) {
        this.timeout(10e3);

        this.app = new Application({
            path: <any>electron, // the type annotation for path is incorrect
            args: [path.join(__dirname, '..', 'dist', 'electron', 'main.js'), '--test-print'],
            env: {
                ZCOIN_CLIENT_TEST: 'true',
                REINITIALIZE_ZCOIN_CLIENT: 'true'
            }
        });

        console.info('Starting Zcoin Client...');
        await this.app.start();
        await this.app.client.waitUntilWindowLoaded();
        console.info('Zcoin Client started.');
    });

    this.afterAll(async function (this: This) {
        if (this.test.parent.tests.find(t => t.state === 'failed')) {
            console.error('Main process logs:');
            console.error(await this.app.client.getMainProcessLogs());
            console.error('Renderer process logs:');
            console.error(await this.app.client.getRenderProcessLogs());
        }

        await this.app.stop();
    });

    it('opens a window', async function (this: This) {
        expect(await this.app.client.getWindowCount()).to.equal(1);
    });

    it('starts', async function (this: This) {
        const startButton = await this.app.client.$('.start-button');
        await startButton.waitForExist();
        await startButton.click();

        await (await this.app.client.$('#network-value')).waitForExist();
    });

    it('allows selecting blockchain location and network', async function (this: This) {
        this.slow(1e3);

        await (await this.app.client.$('#network-value')).selectByAttribute('value', 'regtest');

        // Set data directory.
        const dataDirLocation = path.join(os.tmpdir(), `zcoin-client-test-${Math.floor(Math.random() * 1e16)}`);
        // Creating a new directory is in normal usage taken care of by the file selection dialog.
        fs.mkdirSync(dataDirLocation);
        await this.app.webContents.executeJavaScript(`const e = new Event('set-data-dir'); e.dataDir = ${JSON.stringify(dataDirLocation)}; document.dispatchEvent(e)`);
        await this.app.client.waitUntilTextExists('#datadir-value', dataDirLocation);

        await (await this.app.client.$('#continue-setup')).click();
        await (await this.app.client.$('#create-new-wallet')).waitForExist();
    });

    it('correctly displays and confirms mnemonic', async function (this: This) {
        this.timeout(5e3);
        this.slow(5e3);

        await (await this.app.client.$('#create-new-wallet')).click();
        await (await this.app.client.$('.mnemonic-screen')).waitForExist();

        const words = [];
        for (let n = 0; n < 24; n++) {
            const wordElement = await this.app.client.$(`#mnemonic-word-${n}`);
            words.push(await wordElement.getText());
        }
        expect(words.length).to.equal(24);

        await (await this.app.client.$('#confirm-button')).click();


        await (await this.app.client.$('.mnemonic-word')).waitForExist();

        const wordElements = await this.app.client.$$('.mnemonic-word');
        for (const [n, wordElement] of wordElements.entries()) {
            const classNames = <string>await wordElement.getAttribute('class');
            if (classNames.includes('hidden')) {
                await wordElement.setValue(words[n]);
            } else {
                expect(await wordElement.getText()).to.equal(words[n]);
            }
        }

        const submitButton = await this.app.client.$('#submit-button');
        await submitButton.waitForClickable();
        await submitButton.click();

        await (await this.app.client.$('#passphrase')).waitForExist();
    });
})
