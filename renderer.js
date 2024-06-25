const { ipcRenderer, clipboard } = require('electron');

const $webview = $('.mainWebview');
const urlInput = $('#urlBar');
const backButton = $('#navBack');
const forwardButton = $('#navFrwd');
const launchpad = $('#launchpad');

let curl, updateURL, currentFavi, aot, windowSize, currentBookmarkId, clipURL, showVersion;
let isDragging = false;
let canGoBack, canGoForward, canReload = false;

const rootStyles = getComputedStyle(document.documentElement);
const offlineImg = rootStyles.getPropertyValue('--offline-img').trim().replace(/^url\(["']?/, '').replace(/["']?\)$/, '');

// Window .on() events

$(window).on('load', function () {
    aot = localStorage.getItem('alwaysOnTop') || true;
    ipcRenderer.send('setAOT', aot);

    windowSize = JSON.parse(localStorage.getItem('windowSize') || '{"width":800,"height":600}');
    if (!windowSize.width || !windowSize.height) {
        localStorage.setItem('windowSize', JSON.stringify({ width: 800, height: 600 }));
    }
    ipcRenderer.send('setWindowSize', windowSize)

    if (localStorage.getItem('screenshotLab') === 'true') {
        $('#screenshotLabToggle').prop('checked', true);
        $('body').addClass('altBookmark');
    } else {
        $('body').removeClass('altBookmark');
        checkWindowHeight();
    }

    $webview.on('did-navigate did-frame-finish-load did-finish-load did-navigate-in-page page-title-updated page-favicon-updated dom-ready', handleWebviewEvents);

    $webview.on('did-finish-load', function () {
        updateURL();
        updateButtonStates();
        vibrancyLab();
        screenshotLab();
        checkAndHighlightBookmark()
        updateLatentInfo();
        ipcRenderer.send('nav', {
            canGoBack: $webview[0].canGoBack(),
            canGoForward: $webview[0].canGoForward(),
            canReload: !curl.includes('about:blank')
        });
        setTimeout(() => {
            updateScreenshotIfBookmarked(curl);
        }, 5000);
    });

    document.getElementById('mainWebview').addEventListener('page-favicon-updated', function (favicon) {
        currentFavi = favicon;
        updateLatentInfo();
    })

    if (localStorage.getItem('vibrancyLab') === 'true') {
        $('#vibrancyLabToggle').prop('checked', true);
    }

    if (localStorage.getItem('autoHideChromeLab') === 'true') {
        $('#autoHideChromeToggle').prop('checked', true);
        $('body').addClass('expandChrome');
    } else {
        $('body').removeClass('expandChrome');
    }

    recallBookmarks();

    if (launchpad[0].scrollWidth > launchpad[0].clientWidth) {
        launchpad.addClass('overflow');
    } else {
        launchpad.removeClass('overflow');
    }

    updateURL = () => {
        curl = $webview[0].getURL();
        urlInput.val(curl.replace('https://', '').replace('http://', ''));

        if (curl !== 'about:blank') {
            $('body').addClass('webview-open');
        } else {
            $('body').removeClass('webview-open');
            urlInput.val('');
        }

        if (curl.indexOf('data:') === 0) {
            urlInput.val('');
        }
    };

    $('body').addClass('loaded');

    showHeadsUp('Welcome Back!', '', 7)
});

$(window).on('resize', function () {
    if (localStorage.getItem('screenshotLab') == 'true') {
        $('body').addClass('altBookmark');
    } else {
        checkWindowHeight();
    }

    const currentWindowSize = {
        width: $(window).width(),
        height: $(window).height()
    };
    localStorage.setItem('windowSize', JSON.stringify(currentWindowSize));

    if (launchpad[0].scrollWidth > launchpad[0].clientWidth) {
        launchpad.addClass('overflow');
    } else {
        launchpad.removeClass('overflow');
    }
});

// Element .on() events

$('#newBookmarkName').on('keypress', function (event) {
    if (event.which === 13) {
        performEdit();
    }
});

$webview.on('will-navigate', function (event, url) {
    event.preventDefault();
    updateScreenshotIfBookmarked(url);
    console.log('Navigation attempt prevented: ' + event.url);
});

$webview.on('dom-ready', function () {
    $webview.on('did-start-loading', function () {
        if ($webview[0].isLoading()) {
            $('.loadingThrobber').addClass('show');
        }
    });

    $webview.on('did-stop-loading did-finish-load did-frame-finish-load', function () {
        if (!$webview[0].isLoading()) {
            $('.loadingThrobber').removeClass('show');
        }
    });

    if ($('.mainWebview').hasClass('show')) {
        $webview.executeJavaScript(`
    window.open = function(url, target) {
      if (target === '_blank') {
        console.log('Attempt to open new window prevented');
      } else {
        window.location.href = url;
      }
    };
  `);
    }
});

document.getElementById('mainWebview').addEventListener('did-fail-load', (event) => {
    // $('.loadingThrobber').removeClass('show');
    if (event.errorCode === -105) {
        const failedUrl = urlInput.val().trim();
        if (failedUrl.indexOf('.') > 0 && failedUrl.indexOf(' ') <= 0) {
            showHeadsUp("Couldn't load page", `Requested URL is invalid`, 5)
        } else {
            $webview.attr('src', `https://www.google.com/search?q=${encodeURIComponent(failedUrl)}`)
        }
    }
});

urlInput.on('keydown', (event) => {
    if (event.key === 'Enter') {
        let url = urlInput.val().trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url;
        } else {
            url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        }
        $webview.attr('src', url);
        urlInput.blur();
    }
});

urlInput.on('focus', () => {
    urlInput.select();
});

// On (change)

$('#vibrancyLabToggle').on('change', function () {
    localStorage.setItem('vibrancyLab', $(this).prop('checked'));
    vibrancyLab();
});

$('#screenshotLabToggle').on('change', function () {
    localStorage.setItem('screenshotLab', $(this).prop('checked'));
    if (localStorage.getItem('screenshotLab') === 'true') {
        $('body').addClass('altBookmark');
    } else {
        checkWindowHeight();
    }
});

$('#autoHideChromeToggle').on('change', function () {
    localStorage.setItem('autoHideChromeLab', $(this).prop('checked'));
    if (localStorage.getItem('autoHideChromeLab') === 'true') {
        $('body').addClass('expandChrome');
    } else {
        $('body').removeClass('expandChrome');
    }
});

// On click

$('.appVer').on('click', function (e) {
    if (!$(e.target).closest('.headerBtn').length && !$(e.target).closest('.changesVertex').length) {
        ipcRenderer.send('changes');
        $('#changesDiv').addClass('show');
        $('#labsContainer').removeClass('open');
        // showVersion(0)
    }
});

$('.labsHeader').on('click', function () {
    $('#labsContainer').addClass('open');
    $('#changesDiv').removeClass('show');
    $('.changesVertex').attr('data-current-version', 'Labs')
});

$('.changesHeader').on('click', function () {
    ipcRenderer.send('changes');
    $('#changesDiv').addClass('show');
    $('#labsContainer').removeClass('open');
});

$('#moreBtn').on('click', function () {
    ipcRenderer.send('show-cm');
});

$('#navBack').on('click', function () {
    $webview[0].goBack();
});

$('#navFrwd').on('click', function () {
    $webview[0].goForward();
});

$('#homeBtn').on('click', function () {
    ipcRenderer.send('reload');
});

$('.labDiv .showMoreBtn, .labDiv label').on('click', function () {
    if ($(this).hasClass('showMoreBtn')) {
        $(this).parent().toggleClass('showMore');
    } else {
        if (!$(this).parent().hasClass('showMore')) {
            $(this).parent().addClass('showMore');
        }
    }
})

$('.close').on('click', function () {
    $('#editModal').removeClass('show');
    setTimeout(() => {
        $('#newBookmarkName').val('');
        $('#newBookmarkURL').val('');
    }, 500);
});

$('#editButton').on('click', function () {
    performEdit();
});

$('#bookmarkBtn').on('click', saveBookmark);

// Defined functions

function showHeadsUp(title, message, time) {
    if (title !== '') {
        $('.headsUp .title').text(title)
    } else {
        $('.headsUp .title').empty()
    }
    if (message !== '') {
        $('.headsUp .message').text(message)
    } else {
        $('.headsUp .message').empty()
    }
    $('.headsUp').addClass('show')
    setTimeout(() => {
        $('.headsUp').removeClass('show')
    }, (time * 1000));
}

function handleWebviewEvents() {
    updateURL();
    updateButtonStates();
    vibrancyLab();
    screenshotLab();
    updateScreenshotIfBookmarked(curl);
    checkAndHighlightBookmark()
    updateLatentInfo();
    if ($webview[0].isLoading()) {
        $('.loadingThrobber').addClass('show');
    } else {
        $('.loadingThrobber').removeClass('show');
    }
    ipcRenderer.send('nav', {
        canGoBack: $webview[0].canGoBack(),
        canGoForward: $webview[0].canGoForward(),
        canReload: !curl.includes('about:blank')
    });
}

function updateLatentInfo() {
    $('.latent-info').addClass('unload');
    try {
        const favicon = currentFavi.favicons[currentFavi.favicons.length - 1];
        const $latentFavi = $('.latent-favi');

        $latentFavi.on('error', function () {
            // console.error("Error loading favicon, using offline image.");
            $(this).attr('src', offlineImg);
        });

        $latentFavi.attr('src', favicon);
    } catch (error) {
        if (error instanceof TypeError) {
            // console.error("Error accessing favicon, using offline image.");
            $('.latent-favi').attr('src', offlineImg);
        } else {
            throw error;
        }
    }
    $('.latent-info .title').text($webview[0].getTitle());
    $('.latent-info').removeClass('unload');
}

function updateButtonStates() {
    backButton.prop('disabled', !$webview[0].canGoBack());
    forwardButton.prop('disabled', !$webview[0].canGoForward());
}

function vibrancyLab() {
    if (localStorage.getItem('vibrancyLab') === 'true') {
        const css = `
            body,
            html {
                background: transparent !important;
            }
        `;
        try {
            $webview[0].insertCSS(css);
            console.log('CSS injected successfully');
        } catch (error) {
            console.error('Error reading or injecting CSS:', error);
        }
    }
}

function screenshotLab() {
    if (localStorage.getItem('screenshotLab') === 'true') {
        $('body').addClass('altBookmark');
    } else {
        checkWindowHeight()
    }
}

function checkAndHighlightBookmark() {
    const currentURL = $webview[0].getURL();
    let savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];

    const isBookmarked = savedURLs.some(item => item.url === currentURL);

    if (isBookmarked) {
        $('.bookmarkBtn').addClass('bookmarked');
    } else {
        $('.bookmarkBtn').removeClass('bookmarked');
    }
}

function saveBookmark() {
    const currentURL = $webview[0].getURL();
    const title = $webview[0].getTitle();
    let newFav = currentFavi.favicons[currentFavi.favicons.length - 1] || offlineImg;
    let savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];

    if ($('.launchpad').children('.bookmark-item').length <= 9) {
        $('.launchpad').removeClass('override-altBookmark')
    } else if ($('.launchpad').children('.bookmark-item').length >= 10) {
        showHeadsUp("Compact mode enabled", `You have ${savedURLs.length} bookmark(s) saved; compacting to save space`, 7)
        $('.launchpad').addClass('override-altBookmark')
    } else if ($('.launchpad').children('.bookmark-item').length >= 16) {
        showHeadsUp("Couldn't save bookmark", "You have the maximum 16 bookmarks saved.", 7)
        return;
    }

    if (!savedURLs.some(item => item.url === currentURL)) {
        captureAndSaveBookmark(currentURL, title, newFav, savedURLs);
    } else {
        if (confirm('Bookmark for this URL already exists. Do you want to save it anyway?')) {
            captureAndSaveBookmark(currentURL, title, newFav, savedURLs);
        } else {
            showHeadsUp("Cancelled", "Bookmark not saved.", 7)
        }
    }
}

function captureAndSaveBookmark(currentURL, title, favicon, savedURLs) {
    $webview[0].capturePage().then(image => {
        let screenshot = image.toDataURL();
        const bookmarkIndex = savedURLs.length + 1;

        const newBookmark = { id: 'item' + bookmarkIndex, title, url: currentURL, favicon, screenshot };
        savedURLs.push(newBookmark);

        localStorage.setItem('savedURLs', JSON.stringify(savedURLs));
        ipcRenderer.send('setBookmarks', JSON.stringify(savedURLs));

        recallBookmarks();

        showHeadsUp("Bookmark saved", `You have ${savedURLs.length} bookmark(s) saved; Head to the home page, or hover up here to preview & edit`, 7)
    });
}

function recallBookmarks() {
    const savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];
    const animationDelay = 0.1;

    launchpad.empty();

    savedURLs.forEach((item, index) => {
        const bookmarkItem = $('<div></div>', {
            class: 'bookmark-item',
            id: `bookmark-${index}`,
            url: item.url
        });

        if (index < 10) {
            bookmarkItem.attr('index', index);
            bookmarkItem.addClass('hotkey')
        }

        bookmarkItem.on('contextmenu', function (event) {
            event.preventDefault();
            ipcRenderer.send('show-context-menu', item.id);
        });

        const faviconImg = $('<div>', {
            alt: item.title,
            class: 'favicon favicon_a'
        });

        faviconImg.attr('style', `background-image: url(${item.favicon});`)

        const faviconImg_b = $('<img>', {
            src: item.favicon,
            alt: item.title,
            class: 'favicon favicon_b'
        });

        const cleanUrl = item.url.replace(/^(http:\/\/|https:\/\/)/, '');
        const $titleLabel = $('<div></div>', {
            class: 'bookmark-title',
            url: `${item.url}`,
            title: cleanUrl
        });

        $titleLabel.append(faviconImg);
        $titleLabel.append(faviconImg_b);

        const $titleText = $('<div></div>', {
            text: item.title,
            title: item.title,
            class: 'bookmark-text'
        });

        $titleLabel.append($titleText)

        bookmarkItem.on('click', function () {
            if ($(this).data('dragging')) {
                event.stopImmediatePropagation();
            } else {
                $webview.attr('src', $(this).attr('url'));
                urlInput.val($(this).attr('url').replace('https://', '').replace('http://', ''));
            }
        });

        if (item.screenshot) {
            const $screenshotImg = $('<div class="screenshot"></div>');
            const $img = $('<img>', {
                src: item.screenshot,
                alt: item.title
            });

            const $img_b = $('<img>', {
                src: item.screenshot,
                class: 'screen',
                alt: item.title
            });

            $screenshotImg.append($img);
            $titleLabel.append($img_b);
            bookmarkItem.prepend($screenshotImg);
        }
        bookmarkItem.append($titleLabel);

        bookmarkItem.css('animation-delay', `${(animationDelay * index) + .2}s`);

        launchpad.append(bookmarkItem);

        if ($('.launchpad').children('.bookmark-item').length <= 9) {
            $('.launchpad').removeClass('override-altBookmark')
        } else if ($('.launchpad').children('.bookmark-item').length >= 10) {
            $('.launchpad').addClass('override-altBookmark')
        }

        if (launchpad[0].scrollWidth > launchpad[0].clientWidth) {
            launchpad.addClass('overflow');
        } else {
            launchpad.removeClass('overflow');
        }
    });

    $('#launchpad').sortable({
        items: '.bookmark-item',
        cursor: "move",
        opacity: 0.5,
        tolerance: 'pointer',
        revert: true,
        scroll: false,
        start: function (event, ui) {
            ui.item.data('dragging', true);
            ui.helper.addClass('no-transition');
            ui.placeholder.addClass('no-transition');
            $(this).find('li').addClass('no-transition');
        },
        stop: function (event, ui) {
            ui.item.removeData('dragging');
            ui.helper.removeClass('no-transition');
            ui.placeholder.removeClass('no-transition');
            $(this).find('li').removeClass('no-transition');
        },
        update: function (event, ui) {
            ui.item.removeData('dragging');

            const newOrder = $(this).sortable('toArray', { attribute: 'id' });

            const newSavedURLs = newOrder.map(id => {
                const index = id.split('-')[1] - 1;
                return savedURLs[index];
            });

            localStorage.setItem('savedURLs', JSON.stringify(newSavedURLs));
            recallBookmarks();
            checkWindowHeight();
        }
    });

    ipcRenderer.on('edit-bookmark', (event, bookmarkId) => {
        editBookmark(bookmarkId);
    });

    if (localStorage.getItem('screenshotLab') === 'true') {
        $('body').addClass('altBookmark');
    } else {
        $('body').removeClass('altBookmark');
        checkWindowHeight();
    }
}

function updateScreenshotIfBookmarked(url) {
    let savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];
    let bookmarkedItem = savedURLs.find(item => item.url === url);

    if (bookmarkedItem) {
        $webview[0].capturePage().then(image => {
            let newScreenshot = image.toDataURL();
            bookmarkedItem.screenshot = newScreenshot;
            localStorage.setItem('savedURLs', JSON.stringify(savedURLs));
        });
    }
}

function editBookmark(bookmarkId) {
    const savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];
    const bookmark = savedURLs.find(item => item.id === bookmarkId);

    if (!bookmark) {
        console.error('Bookmark not found');
        return;
    }

    $('#newBookmarkName').val(bookmark.title);
    $('#newBookmarkURL').val(bookmark.url);

    $('.modalTitle').text(`Edit "${bookmark.title}"`);

    currentBookmarkId = bookmarkId;

    $('#editModal').addClass('show');
    $('#newBookmarkName').focus();
}

function performEdit() {
    const newName = $('#newBookmarkName').val().trim();
    const newURL = $('#newBookmarkURL').val().trim();

    if (!newName || !newURL) {
        showHeadsUp("Error", "Either the title or URL are invalid.", 7)
        return;
    }

    const savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];
    const bookmarkIndex = savedURLs.findIndex(item => item.id === currentBookmarkId);

    if (bookmarkIndex === -1) {
        console.error('Bookmark not found');
        return;
    }

    savedURLs[bookmarkIndex].title = newName;
    savedURLs[bookmarkIndex].url = newURL;

    localStorage.setItem('savedURLs', JSON.stringify(savedURLs));

    recallBookmarks();

    $('#editModal').removeClass('show');
}

function checkWindowHeight() {
    if ($('.bookmark-item').length >= 7 && $(window).height() > 425 && $(window).height() < 590) {
        $('body').addClass('altBookmark');
    } else if ($('.bookmark-item').length >= 4 && $(window).height() > 235 && $(window).height() < 425) {
        $('body').addClass('altBookmark');
    } else if ($('.bookmark-item').length >= 1 && $(window).height() < 235) {
        $('body').addClass('altBookmark');
    } else {
        $('body').removeClass('altBookmark');
    }
}

// $(document).on

$(document).on('click', (e) => {
    if (!$.contains($('#changesDiv')[0], e.target) && !$.contains($('.appVer')[0], e.target)) {
        $('.versionDiv').removeClass('show')
    }
    if (!$.contains($('#changesDiv')[0], e.target) && !$.contains($('.appVer')[0], e.target)) {
        $('#changesDiv').removeClass('show');
        $('.versionDiv').removeClass('show')
    }
    if (!$.contains($('#labsContainer')[0], e.target) && !$.contains($('.labsHeader')[0], e.target)) {
        $('#labsContainer').removeClass('open');
        $('.labDiv').removeClass('showMore');
    }
    if (!$.contains($('#editModal')[0], e.target)) {
        $('#editModal').removeClass('show');
    }
});

$(document).on('keydown', (event) => {
    if (document.activeElement && document.activeElement !== document.body) {
        return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key >= '0' && event.key <= '9') {
        const index = parseInt(event.key, 10);

        if (launchpad.length && launchpad.is(':visible')) {
            const $childDivs = launchpad.children();

            if (index < $childDivs.length) {
                $childDivs.eq(index).click();
            }
        }
    }
});

$(document).on('keypress', (event) => {
    if (event.key === 'Enter') {
        if ($('.headsUp') && $('.headsUp').hasClass('show')) {
            if ($webview && clipURL) {
                $webview.attr('src', clipURL);
            }
        }
    }
});

$(document).on('mousedown', '.bookmark-item', (event) => {
    $(this).addClass('travel')
});

$(document).on('mouseup', '.bookmark-item', (event) => {
    $(this).removeClass('travel')
});

// ipcRenderer.on()

ipcRenderer.on('aot-tray', (event, newAOT) => {
    localStorage.setItem('alwaysOnTop', newAOT);
});

ipcRenderer.on('focus-urlbar', () => {
    urlInput.focus();
});

ipcRenderer.on('appVer', (e, ver) => {
    $('#appVerText').text(`v${ver}`);
});

ipcRenderer.on('global-shortcut', (e, state) => {
    localStorage.setItem('globalHotkey', state);
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

    const $prevBtn = $('<button>').addClass('versionNavBtn').text('􀆉');
    const $nextBtn = $('<button>').addClass('versionNavBtn').text('􀆊');

    $prevBtn.on('click', function () {
        showVersion(currentIndex - 1);
    });

    $nextBtn.on('click', function () {
        showVersion(currentIndex + 1);
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
            $('.changesVertex').attr('data-current-version', '(Current) ' + currentVersionNumber.replace('0.', 'v0.').replace(':', ''));
            $('.versionNavBtn').first().addClass('disabled')
        } else if (currentVersionNumber == "0.0.1:") {
            $('.changesVertex').attr('data-current-version', currentVersionNumber.replace('0.', 'v0.').replace(':', ''));
            $('.versionNavBtn').last().addClass('disabled')
        } else {
            $('.changesVertex').attr('data-current-version', currentVersionNumber.replace('0.', 'v0.').replace(':', ''));
            $('.versionNavBtn').last().removeClass('disabled')
            $('.versionNavBtn').first().removeClass('disabled')
        }

    }

    showVersion(0);
});

ipcRenderer.on('remove-bookmark', (event, itemId) => {
    let savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];
    const bookmarkToDelete = savedURLs.find(item => item.id === itemId);

    if (!bookmarkToDelete) {
        console.error('Bookmark not found for removal');
        return;
    }

    const confirmDelete = confirm(`Are you sure you want to delete "${bookmarkToDelete.title}"?`);

    if (confirmDelete) {
        savedURLs = savedURLs.filter(item => item.id !== itemId);
        localStorage.setItem('savedURLs', JSON.stringify(savedURLs));
        recallBookmarks();
        showHeadsUp('Success', `"${bookmarkToDelete.title}" removed`, 7)
    }
});

ipcRenderer.on('window-focus', function () {
    if (!$('body').hasClass('webview-open')) {
        recallBookmarks();
    }
    $('body').removeClass('blur');

    const commonExtensions = [
        '.com', '.net', '.org', '.edu', '.gov', '.mil',
        '.co', '.io', '.app', '.dev',
        '.co.uk', '.uk', '.ca', '.au', '.de', '.fr', '.jp', '.cn',
    ];

    const clipboardText = clipboard.readText().trim();

    if (!clipboardText.includes(' ')) {
        const urlPattern = /^(https?:\/\/)?(www\.)?[^\s]+$/i;

        if (urlPattern.test(clipboardText)) {
            const hasValidExtension = commonExtensions.some(extension => clipboardText.endsWith(extension));

            if (hasValidExtension) {
                if (!clipboardText.startsWith('http://') && !clipboardText.startsWith('https://')) {
                    clipURL = 'https://' + clipboardText;
                } else {
                    clipURL = clipboardText;
                }
                showHeadsUp('Open Link?', clipboardText, 5);
            }
        }
    }

    checkWindowHeight();
    if (localStorage.getItem('screenshotLab') === 'true') {
        $('body').addClass('altBookmark');
    }
});

ipcRenderer.on('external-url', (e, url) => {
    showHeadsUp('Opening Link', url, 7)
    $webview.attr('src', url)
})

ipcRenderer.on('console-log', (event, log) => {
    switch (log.type) {
        case 'log':
            console.log(log.message);
            break;
        case 'warn':
            console.warn(log.message);
            break;
        case 'error':
            console.error(log.message);
            break;
        case 'info':
            console.info(log.message);
            break;
        case 'debug':
            console.debug(log.message);
            break;
        default:
            console.log(log.message);
            break;
    }
});

ipcRenderer.on('window-blur', function () {
    $('body').click().addClass('blur')
});

ipcRenderer.on('reload-wv', function () {
    $webview[0].reload();
});

ipcRenderer.on('webview-devtools', () => {
    $webview[0].openDevTools();
});

ipcRenderer.on('webview-focus', () => {
    $webview[0].focus();
});

ipcRenderer.on('save-bookmark', saveBookmark);

ipcRenderer.on('goBack', () => {
    if (!$('body').hasClass('changes')) {
        if ($webview[0].canGoBack()) {
            $webview[0].goBack();
            updateURL();
        }
    } else {
        ipcRenderer.send('reload')
    }
});

ipcRenderer.on('goFrwd', () => {
    if (!$('body').hasClass('changes')) {
        if ($webview[0].canGoForward()) {
            $webview[0].goForward();
            updateURL();
        }
    } else {
        ipcRenderer.send('reload')
    }
});