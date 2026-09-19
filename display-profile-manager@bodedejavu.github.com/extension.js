/*
author: Paul Bodenbenner <paul.bodenbenner@gmail.com>
*/

const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const { DisplayProfileManager } = Me.imports.newer;
const { sleep } = Me.imports.utils.common

let _displayProfileManager;

function init() {
    Convenience.initTranslations("display-profile-manager");
}

function enable() {
    globalThis.dc = Me.imports.utils.displayConfig;
    globalThis.dp = Me.imports.utils.displayProfile;
    (async () => {
        await sleep(2)
        // log(JSON.stringify(await globalThis.dp.getCurrentProfile()))
        log(JSON.stringify(await dp.getCurrentProfile()))
        await dp.applyProfile(
            {"outputs":[{"edid":"AP///////wBYWAAAegVPAwEAAQOAAAB47u6Ro1RMmSYPUFQAAAABAQEBAQEBAQEBAQEBAQEBJhx6BlBPBjACAgICAAAAAAAAAAAA/QAAyADIZAAKICAgICAgAAAA/ABWQk9YIG1vbml0b3IKAAAAEAAKICAgICAgICAgICAgAPU=","enabled":true,"config":{"x":0,"y":0,"width":1400,"height":847,"transform":0,"frequency":59.93507385253906,"crtcId":0,"primary":false}},{"edid":"AP///////wBYWAAAIANYAgEAAQOAAAB47u6Ro1RMmSYPUFQAAAABAQEBAQEBAQEBAQEBAQEBcgsgBjBYBiACAgICAAAAAAAAAAAA/QAAyADIZAAKICAgICAgAAAA/ABWQk9YIG1vbml0b3IKAAAAEAAKICAgICAgICAgICAgAI8=","enabled":false,"config":{"x":1402,"y":0,"width":800,"height":600,"transform":0,"frequency":59.96049880981445,"crtcId":1,"primary":true}}]}
        )
    })().catch(logError)

    // _displayProfileManager = new DisplayProfileManager();
    // let position = Main.panel.statusArea.aggregateMenu.menu.numMenuItems - 2;
    // Main.panel.statusArea.aggregateMenu.menu.addMenuItem(_displayProfileManager, position);
}

function disable() {
    _displayProfileManager.cleanup();
    _displayProfileManager.destroy();
}

