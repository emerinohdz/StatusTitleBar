/**
 * StatusTitleBar extension
 * @autor: emerino <emerino at gmail dot com>

 * This extension replaces the original AppMenuButton from the
 * gnome-shell panel with a new AppMenuButton that shows the
 * title of the current focused window, when maximized, instead 
 * of the application's name. If the focused window is not
 * maximized then it reverts to showing the application's name.
 *
 */

const Atk = imports.gi.Atk;
const Clutter = imports.gi.Clutter;
const Config = imports.misc.config;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Util = imports.misc.util;

const Shell = imports.gi.Shell;
const Main = imports.ui.main;
const Panel = imports.ui.panel;
const Tweener = imports.ui.tweener;
const Signals = imports.signals;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const Overview = imports.ui.overview;

const FLAGS_MAXED = Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL;
const MAJOR_VERSION = parseInt(Config.PACKAGE_VERSION.split('.')[0]);
const MINOR_VERSION = parseInt(Config.PACKAGE_VERSION.split('.')[1]);
const PANEL_ICON_SIZE = 24;

const ExtensionUtils = imports.misc.extensionUtils;
const Utils = ExtensionUtils.getCurrentExtension().imports.utils;

/**
 * StatusTitleBarButton
 *
 * This class manages the current title of focused maximized window and shows
 * it in the status title bar of the panel.
 *
 */
const StatusTitleBarButton = new Lang.Class({
    Name: 'StatusTitleBarButton',
    Extends: Panel.AppMenuButton,

    _init: function(panel) {
        this.parent(panel);

        /*** Holders for local tracked signals ***/
        this._wsSignals = {};
        //this._targetAppSignals = {};

        // maximize and unmaximize removed and size-change added GS 3.17
        if (MAJOR_VERSION == 3 && MINOR_VERSION < 17) {
            Utils.connectAndTrack(this, global.window_manager, 'maximize',
                    Lang.bind(this, this._onRedimension));
            Utils.connectAndTrack(this, global.window_manager, 'unmaximize',
                    Lang.bind(this, this._onRedimension));
        } else {
            Utils.connectAndTrack(this, global.window_manager, 'hide-tile-preview',
                    Lang.bind(this, this._onHideTitlePreview));
            Utils.connectAndTrack(this, global.window_manager, 'size-change',
                    Lang.bind(this, this._onRedimension));
        }

        Utils.connectAndTrack(this, global.window_manager, 'destroy',
                Lang.bind(this, this._onWindowDestroy));

        Utils.connectAndTrack(this, global.workspace_manager, 'notify::n-workspaces',
                Lang.bind(this, this._workspacesChanged));

        Utils.connectAndTrack(this, global.display, "notify::focus-window",
                Lang.bind(this, this._sync));

        // if actor is destroyed, we must disconnect.
        Utils.connectAndTrack(this, this.actor, 'destroy', 
                Lang.bind(this, this.destroy));

        this._workspacesChanged();
    },

    _sync: function() {
        this.parent();

        let win = global.display.focus_window;
        if (!win) {
            return;
        }

        if (!win._notifyTitleId) {
            this._initWindow(win);
        }

        let targetApp = this._findTargetApp();
        this._setTitle(win, targetApp)
    },

    _workspacesChanged: function() {
        Utils.disconnectTrackedSignals(this._wsSignals);

        for ( let i = 0; i < global.workspace_manager.n_workspaces; ++i ) {
            let ws = global.workspace_manager.get_workspace_by_index(i);

            Utils.connectAndTrack(this._wsSignals, ws, 'window-removed',
                    Lang.bind(this, this._sync));
        }
    },

    _initWindow: function(win) {
        if (win._notifyTitleId) {
            win.disconnect(win._notifyTitleId);
        }

        win._notifyTitleId = win.connect("notify::title", 
                Lang.bind(this, this._onWindowTitleChanged));
    },

    _onWindowTitleChanged: function(win) {
        if (win.has_focus()) {
            let app = this._findTargetApp();

            this._setTitle(win, app);
        }
    },

    _setTitle: function(win, app) {
        this._label.set_text("");

        if (win.get_maximized() == FLAGS_MAXED) {
            this._label.set_text(win.title);
        } else if (app) {
            this._label.set_text(app.get_name());
        }
    },

    // needed for maximize on window drag to top panel
    _onHideTitlePreview: function(shellwm) {
        let win = global.display.focus_window;

        if (!win) {
            return;
        }
        if (win.get_maximized() == FLAGS_MAXED && this._label.text != win.title) {
            this._onWindowTitleChanged(win);
        }
    },

    _onRedimension: function(shellwm, actor) {
        let win = actor.get_meta_window();

        this._onWindowTitleChanged(win);
    },
    _onWindowDestroy: function(shellwm, actor) {
        let win = actor.get_meta_window();
        this._clearWindowSignal(win);

        //this._label.setText("");
    },
    destroy: function () {
        // disconnect signals
        Utils.disconnectTrackedSignals(this);

        // any signals from _workspacesChanged
        Utils.disconnectTrackedSignals(this._wsSignals);

        // clear window signals
        this._clearWindowsSignals();

        // Call parent destroy.
        this.parent();
    },

    _clearWindowsSignals: function() {
        let windows = global.get_window_actors();

        for (let i = 0; i < windows.length; ++i) {
            // we need the MetaWindow here!
            let win = windows[i].get_meta_window();
            this._clearWindowSignal(win);
        }

    },
    _clearWindowSignal: function(win) {
        if (win._notifyTitleId) {
            win.disconnect(win._notifyTitleId);
        }

        win._notifyTitleId = null;
    }

});

Signals.addSignalMethods(StatusTitleBarButton.prototype);

const StatusTitleBar = new Lang.Class({
    Name: 'StatusTitleBar',

    _init: function() {
    }, 

    enable: function() {
        this._replaceAppMenu(new StatusTitleBarButton(Main.panel));
    },

    disable: function() {
        this._replaceAppMenu(new Panel.AppMenuButton(Main.panel));
    },

    _replaceAppMenu: function(appMenu) {
        let panel = Main.panel;
        let statusArea = panel.statusArea;

        let oldAppMenu = statusArea.appMenu;
        panel._leftBox.remove_actor(oldAppMenu.actor.get_parent());
        oldAppMenu.destroy();

        statusArea.appMenu = appMenu;
        let index = panel._leftBox.get_children().length;
        panel._leftBox.insert_child_at_index(appMenu.actor.get_parent(), index);
    }
});

// legacy support
if (!Panel.AppMenuButton.prototype.hasOwnProperty("_findTargetApp")) {
    StatusTitleBarButton.prototype._findTargetApp = function() {
        let workspace = global.workspace_manager.get_active_workspace();
        let tracker = Shell.WindowTracker.get_default();
        let focusedApp = tracker.focus_app;
        if (focusedApp && focusedApp.is_on_workspace(workspace))
            return focusedApp;

        for (let i = 0; i < this._startingApps.length; i++)
            if (this._startingApps[i].is_on_workspace(workspace))
                return this._startingApps[i];

        return null;
    }
} 

// lightweight object, acts only as a holder when ext disabled
let statusTitleBar = null; 

function init() {
    statusTitleBar = new StatusTitleBar();
}

function enable() {
    statusTitleBar.enable();
}

function disable() {
    statusTitleBar.disable();

}
