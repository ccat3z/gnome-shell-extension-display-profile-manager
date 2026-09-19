/*
author: Paul Bodenbenner <paul.bodenbenner@gmail.com>
*/


const GLib = imports.gi.GLib;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GnomeDesktop = imports.gi.GnomeDesktop;
const Lang = imports.lang;
const Shell = imports.gi.Shell;

const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Parser = Me.imports.parser;
const Common = Me.imports.common;
const DisplayConfig = Me.imports.utils.displayConfig
const { sleep } = Me.imports.utils.common

const Gettext = imports.gettext.domain('display-profile-manager');
const _ = Gettext.gettext;


class DisplayProfileManager extends PopupMenu.PopupMenuSection {
    constructor() {
        super();
        this.disposer = new Array();

        this.rotationMapping = {
            'wayland': [0, 1, 2, 3],
            'xrandr': [1, 2, 4, 8]
        };

        this.item = new PopupMenu.PopupSubMenuMenuItem('Display Profiles', true);
        this.item.icon.icon_name = 'preferences-desktop-display-symbolic';
        this.addMenuItem(this.item);

        this._keybindings = new Array();

        this._settings = Convenience.getSettings();
        this._getCurrentSettings();
        this._handlerIdSettings = this._settings.connect('changed', Lang.bind(this, this._onSettingsChanged));

        (async () => {
            await sleep(3)
            await this._onMonitorsChanged()
        })().catch(logError)
        this.disposer.push(DisplayConfig.addMonitorsChangedListener(() => {
            this._onMonitorsChanged().catch(logError)
        }))
    }

    cleanup() {
        this.disposer.forEach(c => c());
        this._clearSignals();
        this._clearKeybindings();
    }

    _clearSignals() {
        if (this._handlerIdMonitorsChanged)
            this._dbusMonitorsChanged.disconnectSignal(this._handlerIdMonitorsChanged);
        if (this._handlerIdSettings)
            this._settings.disconnect(this._handlerIdSettings);
    }

    _clearKeybindings() {
        let keybinding;
        while (this._keybindings.length > 0) {
            keybinding = this._keybindings.pop();
            if (Main.wm.removeKeybinding)
                Main.wm.removeKeybinding(keybinding);
            else
                global.display.remove_keybinding(keybinding);
        }
    }

    _displayConfigProxyWrapper(callback) {
        new DisplayConfigProxy(Gio.DBus.session, 'org.gnome.Shell', '/org/gnome/Mutter/DisplayConfig', callback);
    }

    _getCurrentSettings() {
        let profilesString = this._settings.get_string(Common.SETTINGS_KEY_PROFILES);
        this._profiles = Parser.getProfilesFromString(profilesString);
    }

    _onSettingsChanged() {
        this._getCurrentSettings();
        this._createMenu();
    }

    async _onMonitorsChanged() {
        const resources = await DisplayConfig.getResources()

        this.serial = resources[0];
        this.crtcs = resources[1];
        this.outputs = resources[2];
        this.modes = resources[3];

        log('OUTPUTS' + resources.length)
        this._profile = this._getCurrentProfile();

        let profileStringCurrent = Parser.getProfileAsString(this._profile);
        if (profileStringCurrent != this._settings.get_string(Common.SETTINGS_KEY_CURRENT_PROFILE))
            this._settings.set_string(Common.SETTINGS_KEY_CURRENT_PROFILE, profileStringCurrent);

        this._createMenu();
    }

    // #  #  ###
    // #  #   #
    // #  #   #
    // #  #   #
    // #  #   #
    //  ##   ###    

    _createMenu() {
        this.item.menu.removeAll();
        // TODO: set status
        // this.item.status.text = '';
        // TODO: keybinding
        // this._clearKeybindings();

        this._insertProfileItems();
        this._insertSettingsItems();
    }

    _insertProfileItems() {
        let item;

        if (this._profiles.length == 0) {
            item = new PopupMenu.PopupMenuItem(_("No Profiles Defined"));
            item.actor.reactive = false;
            this.item.menu.addMenuItem(item);
        } else {
            let is_active;
            let active_set = false;
            for (let i = 0; i < this._profiles.length; i++) {
                is_active = this._addProfileItem(i);
                if (is_active == true && active_set == false) {
                    // TODO: set status
                    // this.item.status.text = this._profiles[i][0];
                    active_set = true;
                }
            }
        }
    }

    _insertSettingsItems() {
        this.item.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        let item = new PopupMenu.PopupMenuItem(_("Display Profile Manager Settings"));
        item.connect('activate', () => ExtensionUtils.openPrefs());
        this.item.menu.addMenuItem(item);
    }

    _addProfileItem(profileIndex) {
        let item;
        let is_active = false;

        item = new PopupMenu.PopupMenuItem(this._profiles[profileIndex][0]);
        if (this._checkProfilePossible(this._profiles[profileIndex]) == true) {
            if (Common._compareProfiles(this._profiles[profileIndex], this._profile) == true) {
                item.setOrnament(PopupMenu.Ornament.DOT);
                is_active = true;
            }

            item.connect('activate', () => this._setProfile(this._profiles[profileIndex]).catch(logError));
        } else {
            item.actor.reactive = false;
        }
        this.item.menu.addMenuItem(item);

        let showProfileDescription = this._settings.get_boolean(Common.SETTINGS_KEY_SHOW_PROFILE_DESCRIPTION);
        if (showProfileDescription == true) {
            let profileDescription;
            for (let i = 2; i < this._profiles[profileIndex].length; i++) {
                profileDescription = '';
                profileDescription += '   ' + this._profiles[profileIndex][i][1] + ' - ' + this._profiles[profileIndex][i][4] + 'x' + this._profiles[profileIndex][i][5] + '@' + this._profiles[profileIndex][i][6] + 'Hz';
                if (this._profiles[profileIndex][1] == true)
                    profileDescription += ' (Cloned)';
                item = new PopupMenu.PopupMenuItem(profileDescription);
                item.actor.reactive = false;
                this.item.menu.addMenuItem(item);
            }
        }

        return is_active;
    }

    // ###                 #    #    ##          
    // #  #               # #         #          
    // #  #  ###    ##    #    ##     #     ##   
    // ###   #  #  #  #  ###    #     #    # ##  
    // #     #     #  #   #     #     #    ##    
    // #     #      ##    #    ###   ###    ##   

    async _setProfileByIndex(index) {
        await this._setProfile(this._profiles[index])
    }

    async _setProfile(profile) {
        if (profile.length - 2 > this.crtcs.length) {
            global.log('Error: There are more outputs to set than available logical monitors (CRTC)! Aborting.');
            return;
        }

        let serialOut = this.serial;
        let persistentOut = true;
        let crtcsOut = new Array();
        let outputsOut = new Array();

        for (let i = 0; i < this.outputs.length; i++) {
            let profileIndex = -1;
            for (let j = 2; j < profile.length; j++) {
                if (this.outputs[i][4] == profile[j][0]) {
                    profileIndex = j;
                }
            }

            if (profileIndex == -1) {
                outputsOut.push([this.outputs[i][0], {}]);
            } else {
                if (this.outputs[i][3].indexOf(this.crtcs[crtcsOut.length][0]) == -1) {
                    global.log('Error: Too complicated resolution between outputs and logical monitors (CRTC)! Aborting.');
                    return;
                }

                let newMode = this._getModeFromData(profile[profileIndex][4], profile[profileIndex][5], profile[profileIndex][6], i);
                let rotation = profile[profileIndex][7];
                let transform = this.rotationMapping['wayland'][0];
                let rotationIndex = this.rotationMapping['xrandr'].indexOf(rotation);
                if (rotationIndex != -1)
                    transform = this.rotationMapping['wayland'][rotationIndex];

                crtcsOut.push([this.crtcs[crtcsOut.length][0], newMode, profile[profileIndex][2], profile[profileIndex][3], transform, [this.outputs[i][0]], {}]);
                outputsOut.push([this.outputs[i][0], {
                    primary: GLib.Variant.new_boolean(profile[profileIndex][8])
                }]);
            }
        }

        await DisplayConfig.applyConfiguration({
            serial: serialOut,
            persistent: persistentOut,
            crtcs: crtcsOut,
            outputs: outputsOut
        })
    }

    _checkProfilePossible(profile) {
        for (let i = 2; i < profile.length; i++) {
            let outputFound = false;
            for (let j = 0; j < this.outputs.length; j++) {
                if (this.outputs[j][4] == profile[i][0]) {
                    if (this.outputs[j][7]['display-name'].unpack().toLowerCase() != profile[i][1].toLowerCase())
                        return false;
                    outputFound = true;
                    break;
                }
            }
            if (outputFound == false)
                return false;
        }
        return true;
    }

    _isCurrentClone() {
        let clone = true;
        let modeData0 = null;
        let monitorsCount = 0;
        for (let i = 0; i < this.outputs.length; i++) {
            let crtcIndex = this._getCrtcIndex(this.outputs[i][2]);
            if (crtcIndex == -1)
                continue;
            if (this.crtcs[crtcIndex][2] != 0 || this.crtcs[crtcIndex][3] != 0) {
                clone = false;
                break;
            }
            let modeData = this._getDataFromMode(this.crtcs[crtcIndex][6]);
            if (modeData0 == null) {
                modeData0 = modeData;
            } else {
                if (modeData[0] != modeData0[0] || modeData[1] != modeData0[1] || modeData[2] != modeData0[2]) {
                    clone = false;
                    break;
                }
            }
            monitorsCount += 1;
        }
        if (monitorsCount == 1)
            clone = false;
        return clone
    }

    _getCurrentProfile() {
        let profile = new Array();

        profile.push('Unnamed');
        profile.push(this._isCurrentClone());

        for (let i = 0; i < this.outputs.length; i++) {
            let output = this._getCurrentOutput(i);
            if (output != null)
                profile.push(output);
        }
        return profile;
    }

    _getCurrentOutput(iOutput) {
        let crtcIndex = this._getCrtcIndex(this.outputs[iOutput][2]);
        if (crtcIndex == -1)
            return null;
        let modeData = this._getDataFromMode(this.crtcs[crtcIndex][6]);

        let width = modeData[0];
        let height = modeData[1];
        let refreshRate = modeData[2];
        let x = this.crtcs[crtcIndex][2];
        let y = this.crtcs[crtcIndex][3];
        let transform = this.crtcs[crtcIndex][7];
        let name = this.outputs[iOutput][4];
        let displayName = this.outputs[iOutput][7]['display-name'].unpack();
        let primary = this.outputs[iOutput][7]['primary'].unpack();

        let rotation = this.rotationMapping['xrandr'][0];
        let rotationIndex = this.rotationMapping['wayland'].indexOf(transform);
        if (rotationIndex != -1)
            rotation = this.rotationMapping['xrandr'][rotationIndex];

        let output = new Array();
        output.push(name);
        output.push(displayName);
        output.push(x);
        output.push(y);
        output.push(width);
        output.push(height);
        output.push(refreshRate);
        output.push(rotation);
        output.push(primary);

        return output;
    }

    _getCrtcIndex(crtc) {
        let crtcIndex = -1;
        for (let i = 0; i < this.crtcs.length; i++) {
            if (this.crtcs[i][0] == crtc) {
                crtcIndex = i;
                break;
            }
        }
        return crtcIndex;
    }

    _getModeFromData(width, height, refreshRate, iOutput) {
        let mode = -1;
        for (let i = 0; i < this.modes.length; i++) {
            if (this.outputs[iOutput][5].indexOf(this.modes[i][0]) != -1 && this.modes[i][2] == width && this.modes[i][3] == height && Math.round(this.modes[i][4]) == refreshRate) {
                mode = this.modes[i][0];
                break;
            }
        }
        return mode;
    }

    _getDataFromMode(mode) {
        let width = 0;
        let height = 0;
        let refreshRate = 0;

        for (let i = 0; i < this.modes.length; i++) {
            if (this.modes[i][0] == mode) {
                width = this.modes[i][2];
                height = this.modes[i][3];
                refreshRate = Math.round(this.modes[i][4]);
                break;
            }
        }
        return [width, height, refreshRate];
    }
}
