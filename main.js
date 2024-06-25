const { app, session, BrowserWindow, protocol, screen, globalShortcut, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow, tray, contextMenu, contextMenuF, currentDisplay;
let alwaysOnTop, isShortcutRegistered = true;
let canGoBack, canGoForward, canReload = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 400,
        minHeight: 200,
        frame: false,
        show: false,
        vibrancy: 'hud',
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
            webviewTag: true,
            scrollBounce: true,
            enableRemoteModule: true,
            nativeWindowOpen: false
        },
        alwaysOnTop: true,
        skipTaskbar: true
    });

    mainWindow.loadFile('index.html');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.on('resize', handleResize);

    mainWindow.on('blur', () => {
        if (!alwaysOnTop) {
            mainWindow.hide();
        }
    });

    mainWindow.on('show', function () {
        globalShortcut.register('CmdOrCtrl+Shift+I', () => { mainWindow.webContents.send('webview-devtools'); });
        globalShortcut.register('CmdOrCtrl+L', () => { mainWindow.webContents.send('focus-urlbar'); });
        globalShortcut.register('CmdOrCtrl+H', () => { mainWindow.reload(); });
        globalShortcut.register('CmdOrCtrl+R', () => { mainWindow.webContents.send('reload-wv'); });
        globalShortcut.register('CmdOrCtrl+K', () => { mainWindow.webContents.send('save-bookmark'); });
        globalShortcut.register('Command+Left', () => { mainWindow.send('goBack') })
        globalShortcut.register('Command+Right', () => { mainWindow.send('goFrwd') })
        globalShortcut.register('Escape', () => { mainWindow.hide(); });
        mainWindow.webContents.send('window-focus')

        const { x: mx, y: my } = screen.getCursorScreenPoint();
        const windowSize = mainWindow.getBounds();
        const display = screen.getDisplayNearestPoint({ x: mx, y: my });
        const { width: displayWidth, height: displayHeight } = display.workAreaSize;

        mainWindow.setBounds({
            x: display.bounds.x + (displayWidth / 2) - (windowSize.width / 2),
            y: display.bounds.y + (displayHeight / 2) - (windowSize.height / 2),
            width: windowSize.width,
            height: windowSize.height
        });
    });

    mainWindow.on('hide', function () {
        globalShortcut.unregister('CmdOrCtrl+Shift+I');
        globalShortcut.unregister('CmdOrCtrl+L');
        globalShortcut.unregister('CmdOrCtrl+H');
        globalShortcut.unregister('CmdOrCtrl+R');
        globalShortcut.unregister('CmdOrCtrl+K');
        globalShortcut.unregister('Command+Left')
        globalShortcut.unregister('Command+Right')
        globalShortcut.unregister('Escape');
        mainWindow.webContents.send('window-blur');
    })

    ipcMain.on('show-context-menu', (event, itemId) => {
        const template = [
            {
                label: 'Remove bookmark',
                click: () => {
                    event.sender.send('remove-bookmark', itemId);
                }
            },
            {
                label: 'Edit bookmark...',
                click: () => {
                    event.sender.send('edit-bookmark', itemId);
                }
            }
        ];

        const menu = Menu.buildFromTemplate(template);
        menu.popup(BrowserWindow.fromWebContents(event.sender));
    });

    tray = new Tray(path.join(__dirname, './buildResources/pickerIconTemplate.png'));
    rebuildContextMenu();
    tray.setToolTip('PopApp');
    tray.on('right-click', () => {
        tray.popUpContextMenu(contextMenuF);
    });

    tray.on('click', () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    mainWindow.webContents.on('new-window', (event, url) => {
        event.preventDefault();
        console.log('new window attempt blocked')
        mainWindow.webContents.send('external-url', url)
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        event.preventDefault();
        console.log('new window attempt blocked')
        mainWindow.webContents.send('external-url', url)
    });

    // mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    //     console.log(`new window attempt blocked for url: ${url}`)
    //     mainWindow.webContents.send('external-url', url)
    //     return { action: 'deny' };
    // });

    mainWindow.once('ready-to-show', () => {
        centerWindow(mainWindow);
        mainWindow.show();
    });

    captureConsoleLogs();
}

app.on('web-contents-created', (e, wc) => {
    // wc: webContents of <webview> is now under control
    wc.setWindowOpenHandler((handler) => {
        console.log('new window attempt blocked')
        mainWindow.webContents.send('external-url', handler.url)
        return { action: "deny" }; // deny or allow
    });
});

function centerWindow(window) {
    const { x: mx, y: my } = screen.getCursorScreenPoint();
    const windowSize = window.getBounds();
    currentDisplay = screen.getDisplayNearestPoint({ x: mx, y: my });
    const { width: displayWidth, height: displayHeight } = currentDisplay.workAreaSize;

    window.setBounds({
        x: currentDisplay.bounds.x + (displayWidth / 2) - (windowSize.width / 2),
        y: currentDisplay.bounds.y + (displayHeight / 2) - (windowSize.height / 2),
        width: windowSize.width,
        height: windowSize.height
    });
}

function captureConsoleLogs() {
    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
    };

    console.log = function (...args) {
        originalConsole.log.apply(this, args);
        mainWindow.webContents.send('console-log', { type: 'log', message: args.join(' ') });
    };

    console.warn = function (...args) {
        originalConsole.warn.apply(this, args);
        mainWindow.webContents.send('console-log', { type: 'warn', message: args.join(' ') });
    };

    console.error = function (...args) {
        originalConsole.error.apply(this, args);
        mainWindow.webContents.send('console-log', { type: 'error', message: args.join(' ') });
    };

    console.info = function (...args) {
        originalConsole.info.apply(this, args);
        mainWindow.webContents.send('console-log', { type: 'info', message: args.join(' ') });
    };

    console.debug = function (...args) {
        originalConsole.debug.apply(this, args);
        mainWindow.webContents.send('console-log', { type: 'debug', message: args.join(' ') });
    };
}

function rebuildContextMenu() {

    contextMenuF = Menu.buildFromTemplate([
        {
            label: 'Hide when clicked outside',
            type: 'checkbox',
            checked: !alwaysOnTop,
            click: () => {
                alwaysOnTop = !alwaysOnTop;
                mainWindow.setAlwaysOnTop(alwaysOnTop, 'floating');
                mainWindow.webContents.send('aot-tray', alwaysOnTop); // Send IPC message to renderer process
            }
        },
        {
            label: 'Use global shortcut (Alt+Space)',
            type: 'checkbox',
            checked: isShortcutRegistered,
            click: (menuItem) => {
                isShortcutRegistered = menuItem.checked;
                toggleGlobalShortcut(isShortcutRegistered);
                mainWindow.webContents.send('global-shortcut', isShortcutRegistered); // Send IPC message to renderer process
            },
        },
        { type: 'separator' },
        { role: 'quit', accelerator: 'CmdOrCtrl+Q' }
    ]);
    contextMenu = Menu.buildFromTemplate([
        {
            label: 'Hide when clicked outside',
            type: 'checkbox',
            checked: !alwaysOnTop,
            click: () => {
                alwaysOnTop = !alwaysOnTop;
                mainWindow.setAlwaysOnTop(alwaysOnTop, 'floating');
                mainWindow.webContents.send('aot-tray', alwaysOnTop); // Send IPC message to renderer process
            }
        },
        {
            label: 'Use global shortcut (Alt+Space)',
            type: 'checkbox',
            checked: isShortcutRegistered,
            click: (menuItem) => {
                isShortcutRegistered = menuItem.checked;
                toggleGlobalShortcut(isShortcutRegistered);
                mainWindow.webContents.send('global-shortcut', isShortcutRegistered); // Send IPC message to renderer process
            },
        },
        { type: 'separator' },
        {
            label: 'Home',
            click: () => {
                mainWindow.reload()
            },
            accelerator: 'CmdOrCtrl+H'
        },
        {
            label: 'Reload',
            enabled: canReload,
            click: () => {
                mainWindow.send('reload')
            },
            accelerator: 'CmdOrCtrl+R'
        },
        {
            label: 'Back',
            enabled: canGoBack,
            click: () => {
                mainWindow.send('goBack')
            },
            accelerator: 'Command+Left'
        },
        {
            label: 'Forward',
            enabled: canGoForward,
            click: () => {
                mainWindow.send('goFrwd')
            },
            accelerator: 'Command+Right'
        },
        { type: 'separator' },
        { role: 'quit', accelerator: 'CmdOrCtrl+Q' }
    ]);
}

ipcMain.on('nav', (e, nav) => {
    canReload = nav.canReload;
    if (canReload) {
        canGoBack = nav.canGoBack;
        canGoForward = nav.canGoForward;
    } else {
        canGoBack = false;
        canGoForward = false;
    }
    rebuildContextMenu();
})

function toggleGlobalShortcut(enable) {
    if (enable) {
        globalShortcut.register('Alt+Space', () => {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
                mainWindow.webContents.send('window-blur');
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        });
    } else {
        globalShortcut.unregister('Alt+Space');
    }
    mainWindow.webContents.send('global-hotkey', enable)
}

ipcMain.on('reload', (event) => {
    mainWindow.reload();
});

ipcMain.on('changes', (event) => {
    const filePath = path.join(__dirname, './buildResources/changes.txt');
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return;
        }
        const htmlContent = convertToHtml(data);
        event.sender.send('changes', htmlContent);
    });
});

function convertToHtml(text) {
    const lines = text.split('\n');
    let html = '';
    let insideUl = false;

    const patterns = ['(New)', '(Updated)', '(Removed)', '(Fixed)', '(Bug)', '(Lab)'];

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine === '') {
            return;
        }

        if (/^\d+\.\d+\.\d+/.test(trimmedLine)) {
            if (insideUl) {
                html += '</ul>';
                insideUl = false;
            }
            html += `<h3>${trimmedLine}</h3><ul>`;
            insideUl = true;
        } else if (/^-\s/.test(trimmedLine)) {
            const indentLevel = (line.match(/^(\s*)-/) || [])[1].length / 2;
            let formattedLine = trimmedLine.slice(1).trim();

            patterns.forEach(pattern => {
                formattedLine = formattedLine.replace(pattern, `<b>${pattern}</b>`);
            });

            if (indentLevel > 0) {
                html += '<ul>'.repeat(indentLevel) + `<li>${formattedLine}</li>` + '</ul>'.repeat(indentLevel);
            } else {
                html += `<li>${formattedLine}</li>`;
            }
        }
    });

    if (insideUl) {
        html += '</ul>';
    }

    return html;
}

ipcMain.on('show-cm', function () {
    contextMenu.popup({
        window: mainWindow
    })
})

ipcMain.on('setAOT', (event, resp) => {
    alwaysOnTop = resp;
});

ipcMain.on('setWindowSize', (event, size) => {
    const { x, y } = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint({ x, y });
    const { width: displayWidth, height: displayHeight } = display.workAreaSize;

    mainWindow.setBounds({
        x: display.bounds.x + (displayWidth / 2) - (size.width / 2),
        y: display.bounds.y + (displayHeight / 2) - (size.height / 2),
        width: size.width,
        height: size.height
    });

    mainWindow.show();
    mainWindow.focus();
});

function handleResize() {
    const { width, height } = mainWindow.getBounds();
    const { width: displayWidth, height: displayHeight } = currentDisplay.workAreaSize;

    const newX = (displayWidth - width) / 2;
    const newY = (displayHeight - height) / 2;

    mainWindow.webContents.executeJavaScript(`localStorage.setItem("windowSize", JSON.stringify({ width: ${width}, height: ${height} }))`);

    mainWindow.setBounds({
        x: currentDisplay.bounds.x + newX,
        y: currentDisplay.bounds.y + newY,
        width: width,
        height: height
    });
}

app.on('open-url', (event, url) => {
    event.preventDefault();
    if (!mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
    } else {
        mainWindow.focus();
    }
    mainWindow.webContents.send('external-url', url)
});

let offsetX, offsetY;

protocol.registerSchemesAsPrivileged([
    { scheme: 'http', privileges: { standard: true, secure: true, supportFetchAPI: true } },
    { scheme: 'https', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

app.on('ready', () => {
    createWindow();
    toggleGlobalShortcut(true);

    mainWindow.webContents.on('did-finish-load', function () {
        mainWindow.webContents.send('appVer', app.getVersion());
    })

    ipcMain.on('start-drag', (event, { startX, startY }) => {
        const { x, y } = mainWindow.getBounds();
        offsetX = x - (startX);
        offsetY = y - (startY);
    });

    ipcMain.on('dragging', (event, { currentX, currentY }) => {
        mainWindow.setBounds({
            x: currentX + offsetX,
            y: currentY + offsetY
        });
    });
});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    } else {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
    }
});
