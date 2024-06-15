const { app, BrowserWindow, screen, globalShortcut, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let alwaysOnTop = true;
let tray;
let contextMenu, contextMenuF
let isShortcutRegistered = true;

let canGoBack, canGoForward, canReload = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 400,
        minHeight: 200,
        frame: false,
        vibrancy: 'hud',
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
            webviewTag: true,
            scrollBounce: true
        },
        alwaysOnTop: true,
        skipTaskbar: true
    });

    mainWindow.center();
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
                label: 'Remove',
                click: () => {
                    event.sender.send('remove-bookmark', itemId);
                }
            },
            {
                label: 'Edit',
                click: () => {
                    event.sender.send('edit-bookmark', itemId);
                }
            }
        ];

        const menu = Menu.buildFromTemplate(template);
        menu.popup(BrowserWindow.fromWebContents(event.sender));
    });

    tray = new Tray(path.join(__dirname, 'pickerIconTemplate.png'));
    rebuildContextMenu();
    tray.setToolTip('PopApp');
    tray.on('right-click', () => {
        tray.popUpContextMenu(contextMenuF);
    });

    // Toggle main window visibility on tray icon click
    tray.on('click', () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    mainWindow.hide();
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
    const filePath = path.join(__dirname, 'changes.txt');
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

    const patterns = ['(New)', '(Updated)', '(Removed)', '(Fixed)'];

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
    mainWindow.show();
    mainWindow.setSize(size.width, size.height);
    mainWindow.center();
    mainWindow.focus();
});

function handleResize() {
    const { width, height } = mainWindow.getBounds();
    const display = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = display.workAreaSize;

    const newX = (screenWidth - width) / 2;
    const newY = (screenHeight - height) / 2;

    mainWindow.webContents.executeJavaScript(`localStorage.setItem("windowSize", JSON.stringify({ width: ${width}, height: ${height} }))`);

    mainWindow.setBounds({ x: newX, y: newY, width, height });
}

let offsetX, offsetY;

app.on('ready', () => {
    createWindow();
    toggleGlobalShortcut(true);

    mainWindow.webContents.on('did-finish-load', function () {
        mainWindow.webContents.send('appver', app.getVersion());
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
