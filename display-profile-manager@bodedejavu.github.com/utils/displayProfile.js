const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { base64_encode, Variant } = imports.gi.GLib;
const DisplayConfig = Me.imports.utils.displayConfig;

function getBase64EdidFromOutputResourecs(output) {
    return base64_encode(output.properties.edid.get_data_as_bytes().toArray());
}

async function getCurrentProfile() {
    const resources = await DisplayConfig.getResources();

    const outputs = resources.outputs.map(op => {
        const edid = getBase64EdidFromOutputResourecs(op);
        const crtc = resources.crtcs.find(c => c.id == op.crtc);
        if (crtc === undefined) {
            return {
                edid,
                enabled: false
            };
        }

        const {
            id: crtcId,
            mode: modeId,
            x,
            y,
            width,
            height,
            transform
        } = crtc;
        const {
            frequency
        } = resources.modes.find(m => m.id == modeId);

        return {
            edid,
            enabled: true,
            config: {
                x,
                y,
                width,
                height,
                transform,
                frequency,
                crtcId,
                primary: op.properties.primary.get_boolean()
            }
        };
    });

    return {
        outputs
    };
}

function isPossibleProfile(resources, profile) {
    const currentEdids = resources.outputs.map(getBase64EdidFromOutputResourecs);
    const missingEdids = profile.outputs.map(o => o.edid).filter(e => !currentEdids.includes(e))
    return missingEdids.length === 0
}

function findMode(resources, {
    width,
    height,
    frequency
}) {
    for (const mode of resources.modes) {
        if (mode.width === width &&
            mode.height === height &&
            mode.frequency === mode.frequency) {
            return mode.id
        }
    }

    throw new Error(`cannot find mode for ${width}x${height}-${frequency}`)
}

function findOutputByEdid(resourcse, edid) {
    for (const output of resourcse.outputs) {
        if (getBase64EdidFromOutputResourecs(output) === edid) {
            return output.id
        }
    }

    throw new Error(`cannot find output ${edid}`)
}

async function applyProfile(profile) {
    const resources = await DisplayConfig.getResources();
    if (!isPossibleProfile(resources, profile)) {
        throw new Error('invalid profile for current monitors')
    }
    
    const crtcs = resources.crtcs.map(c => ({
        id: c.id,
        mode: -1,
        x: c.x,
        y: c.y,
        transform: c.transform,
        outputs: [],
        properties: {}
    }))
    const outputs = resources.outputs.map(op => ({ id: op.id, properties: {} }));
    for (const op of profile.outputs) {
        if (!op.enabled) continue

        let crtc = crtcs.find(c => c.id == op.config.crtcId)
        if (crtc === undefined) throw new Error(`cannot find crtc ${op.config.crtcId}`)

        let outputId = findOutputByEdid(resources, op.edid)
        let output = outputs.find(o => o.id === outputId)
        if (output === undefined) throw new Error(`cannot find output ${edid}`)

        crtc.id = op.config.crtcId
        crtc.mode = findMode(resources, op.config)
        crtc.x = op.config.x
        crtc.y = op.config.y
        crtc.transform = op.config.transform
        crtc.outputs.push(output.id)
        output.properties.primary = Variant.new_boolean(op.config.primary)
    }

    const config = {
        serial: resources.id,
        persistent: true,
        crtcs,
        outputs
    }
    log(JSON.stringify(config))
    await DisplayConfig.applyConfiguration(config)
}