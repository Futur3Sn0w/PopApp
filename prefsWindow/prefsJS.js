const { ipcRenderer, systemPreferences } = require('electron');

let accentColor;

$(document).ready(function () {
    accentColor = localStorage.getItem('accent') || '#0000ff';
    $(':root').css('--accent', accentColor)

    $('.tab').each(function () {
        var title = $(this).attr('data-title');
        var icon = $(this).attr('symbol');

        var tabButton = $('<div></div>', {
            class: title == "General" ? "tabButton selected" : 'tabButton',
            'data-title': title,
            click: function () {
                $('.tabButton').removeClass('selected')
                $(this).addClass('selected')
                $('.tab').removeClass('show');

                resizeWindow(425, calculateHeight(title));
                $('.tab[data-title="' + title + '"]').toggleClass('show');
            },
            hover: function () {
                $('.gleam').css('left', $(this).position().left);
                $('.gleam').css('width', $(this).outerWidth());
            },
            mouseleave: function () {
                $('.gleam').css('left', $('.tabButton.selected').position().left);
                $('.gleam').css('width', $('.tabButton.selected').outerWidth());
            }
        });

        var icon = $(`<icon>${icon}</icon>`);

        tabButton.append(icon);

        $('.tabBtns').append(tabButton);

        $('.tabButton[data-title="General"]').click();
        $('.gleam').css('left', $('.tabButton[data-title="General"]').position().left);
        $('.gleam').css('width', $('.tabButton[data-title="General"]').outerWidth());
    });

    if (localStorage.getItem('screenshotLab') === 'true') {
        $('#screenshotLabToggle').prop('checked', true);
    }

    if (localStorage.getItem('vibrancyLab') === 'true') {
        $('#vibrancyLabToggle').prop('checked', true);
    }

    if (localStorage.getItem('autoHideChromeLab') === 'true') {
        $('#autoHideChromeToggle').prop('checked', true);
    }

    if (localStorage.getItem('globalHotkey') === 'true') {
        $('#globalShortcutToggle').prop('checked', true);
    }

    if (localStorage.getItem('autoHideWindowLab') === 'false') {
        $('#autoHideWindowToggle').prop('checked', true);
    }

    if (localStorage.getItem("searchEngine")) {
        $("#searchEngine").val(localStorage.getItem("searchEngine"));
    }

    if (localStorage.getItem("bookmarkStyles")) {
        $("#bookmarkStyles").val(localStorage.getItem("bookmarkStyles"));
    }

    ipcRenderer.send('changes');

    setupColors();
});

ipcRenderer.on('changes', (event, content) => {
    const $changesDiv = $('.changesDiv');
    $changesDiv.empty();

    const versions = content.split('<h3>');
    let currentIndex = 0;

    versions.forEach((versionHtml, index) => {
        if (versionHtml.trim() === '') return;

        const $div = $('<div>').addClass('versionDiv');

        const versionContent = versionHtml.split('</h3>');
        const versionNumber = versionContent[0].trim();
        const changesContent = versionContent[1].trim();

        $div.html(`<h3>${index === 0 ? '(Current) ' : ''}${versionNumber}</h3>${changesContent}`);

        $changesDiv.append($div);
    });

    const $prevBtn = $('<button>').addClass('versionNavBtn prevBtn').text('􀆉');
    const $nextBtn = $('<button>').addClass('versionNavBtn nextBtn').text('􀆊');

    $prevBtn.on('click', function () {
        showVersion(currentIndex - 1);
        resizeWindow(425, calculateHeight(title));

    });

    $nextBtn.on('click', function () {
        showVersion(currentIndex + 1);
        resizeWindow(425, calculateHeight(title));

    });

    $('.changesVertex').empty().append($prevBtn, $nextBtn);

    showVersion = function (index) {
        if (index < 0 || index >= versions.length - 1) return;

        const $currentDiv = $changesDiv.children('.versionDiv').eq(currentIndex);
        const $nextDiv = $changesDiv.children('.versionDiv').eq(index);

        $currentDiv.removeClass('show');
        $nextDiv.addClass('show');

        currentIndex = index;

        const currentVersionNumber = $nextDiv.find('h3').text().replace('(Current) ', '').trim();
        if (currentIndex === 0) {
            $('.changesVertex').attr('version', currentVersionNumber.replace('0.', 'v0.').replace(':', ''));
            $('.versionNavBtn').first().addClass('disabled')
        } else if (currentVersionNumber == "0.0.1:") {
            $('.changesVertex').attr('version', currentVersionNumber.replace('0.', 'v0.').replace(':', ''));
            $('.versionNavBtn').last().addClass('disabled')
        } else {
            $('.changesVertex').attr('version', currentVersionNumber.replace('0.', 'v0.').replace(':', ''));
            $('.versionNavBtn').last().removeClass('disabled')
            $('.versionNavBtn').first().removeClass('disabled')
        }

    }

    showVersion(0);
});

function setupColors() {
    ipcRenderer.send('get-colors')
}

ipcRenderer.on('system-colors', (event, colors) => {
    colors.forEach(color => {
        const rootVariableName = `--system-${color.name}`;
        $(':root').css(rootVariableName, color.hex);
    });
});

function resizeWindow(width, height) {
    ipcRenderer.send('prefs-resize', width, height);
}

function calculateHeight(title) {
    let totalHeight = 0;
    let minHeight = 60;
    if (title == 'Labs') {
        totalHeight = (minHeight) + $(`.tab.labs`).outerHeight(true);
    } else if (title == 'General') {
        totalHeight = minHeight + $(`.tab.general`).outerHeight(true);
    } else if (title == 'What\'s New?') {
        totalHeight = minHeight + 450;
    }
    return totalHeight;
}

$(document).on('keydown', (event) => {
    if (event.metaKey && event.key == ',') {
        ipcRenderer.send('toggle-prefs');
    }
});

ipcRenderer.on('window-focus', function () {
    $('body').removeClass('blur');
});

ipcRenderer.on('window-blur', function () {
    $('body').addClass('blur')
});

ipcRenderer.on('show-tab', function (e, tab) {
    setTimeout(() => {
        $(`.tabButton[data-title="${tab}"`).click();
        $('.gleam').css('left', $('.tabButton.selected').position().left);
        $('.gleam').css('width', $('.tabButton.selected').outerWidth());
    }, 250);
});

$('#vibrancyLabToggle').on('change', function () {
    localStorage.setItem('vibrancyLab', $(this).prop('checked'));
    mainWindowFunction('vibrancyLab');
});

$('#screenshotLabToggle').on('change', function () {
    localStorage.setItem('screenshotLab', $(this).prop('checked'));
    if (localStorage.getItem('screenshotLab') === 'true') {
        $('body').addClass('altBookmark');
    } else {
        mainWindowFunction('checkWindowHeight')
    }
});

function mainWindowFunction(fnName) {
    ipcRenderer.send('mainWindow-function', fnNme)
}

$('#autoHideChromeToggle').on('change', function () {
    localStorage.setItem('autoHideChromeLab', $(this).prop('checked'));
    if (localStorage.getItem('autoHideChromeLab') === 'true') {
        $('body').addClass('expandChrome');
    } else {
        $('body').removeClass('expandChrome');
    }
});

$('#autoHideWindowToggle').on('change', function () {
    localStorage.setItem('autoHideWindowLab', !$(this).prop('checked'));
    ipcRenderer.send('setAOT', !$(this).prop('checked'))
});

$('#globalShortcutToggle').on('change', function () {
    localStorage.setItem('globalHotkey', $(this).prop('checked'));
    ipcRenderer.send('globalShortcut-setting', $(this).prop('checked'));
});

ipcRenderer.on('accent', (e, color) => {
    accentColor = color;
    $(':root').css('--accent', accentColor)
    localStorage.setItem('accent', accentColor);
})

$("#searchEngine").change(function () {
    var val = $(this).val();

    localStorage.setItem("searchEngine", val);
    ipcRenderer.send('searchEngine')
});

$("#bookmarkStyles").change(function () {
    var val = $(this).val();

    localStorage.setItem("bookmarkStyles", val);
    ipcRenderer.send('bookmark-style')
});