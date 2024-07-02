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
    if (localStorage.getItem('autoHideWindowLab') === 'false') {
        ipcRenderer.send('setAOT', false);
    } else {
        ipcRenderer.send('setAOT', true);
    }

    if (!localStorage.getItem('searchEngine')) {
        localStorage.setItem('searchEngine', 'google');
    }
    engineCheck();

    if (!localStorage.getItem('bookmarkStyles')) {
        localStorage.setItem('bookmarkStyles', 'channel');
    }
    $('.launchpad').attr('bookmarkstyle', localStorage.getItem('bookmarkStyles'));

    if (localStorage.getItem('accent')) {
        $(':root').css('--accent', localStorage.getItem('accent'));
    }

    windowSize = JSON.parse(localStorage.getItem('windowSize') || '{"width":800,"height":600}');
    if (!windowSize.width || !windowSize.height) {
        localStorage.setItem('windowSize', JSON.stringify({ width: 800, height: 600 }));
    }
    ipcRenderer.send('setWindowSize', windowSize)

    if (localStorage.getItem('screenshotLab') === 'true') {
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

    if (localStorage.getItem('autoHideChromeLab') === 'true') {
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

        if (!urlInput.is(':focus')) {
            urlInput.val(curl.replace('https://', '').replace('http://', ''));
        }

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
    // console.log('Navigation attempt prevented: ' + event.url);
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
    if (event.errorCode === -105) {
        const failedUrl = urlInput.val().trim();
        if (failedUrl.indexOf('.') >= 1) {
            showHeadsUp("Couldn't load page", `Requested URL is invalid`, 5)
        } else if (failedUrl && failedUrl.indexOf('%20') < 1) {
            $webview.attr('src', `https://www.google.com/search?q=${encodeURIComponent(failedUrl)}`)
        }
    } else {
        $('.loadingThrobber').removeClass('show');
    }
});

urlInput.on('keydown', (event) => {
    if (event.key === 'Enter') {
        urlBarInput()
    }
});

function urlBarInput() {
    let url = urlInput.val().trim();
    if (url == '' || url == $webview[0].getURL()) {
        urlInput.blur();
    } else if (url.indexOf('.') > 0) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            $webview.attr('src', `http://${url}`);
        } else {
            $webview.attr('src', url);
        }
    } else {
        let engine = localStorage.getItem('searchEngine');
        localStorage.setItem('temp-searchTerm', url);
        if (engine == 'google') {
            $webview.attr('src', `https://www.google.com/search?q=${encodeURIComponent(url)}`);
        } else if (engine == 'chatgpt') {
            $webview.attr('src', `https://www.chatgpt.com/`);

            document.getElementById('mainWebview').addEventListener('did-finish-load', () => {
                document.getElementById('mainWebview').executeJavaScript(`
                    if (document.getElementById('prompt-textarea') && document.querySelector('form button[data-testid="fruitjuice-send-button"]')) {
                        setTimeout(function () {
                            document.getElementById('prompt-textarea').value = "${url}";
                            document.getElementById('prompt-textarea').dispatchEvent(new Event('input', { bubbles: true }));
                        }, 250)
                        setTimeout(function () {
                                document.querySelector('form button[data-testid="fruitjuice-send-button"]').click();
                                console.log('done')
                        }, 500)
                    }
                  `);
            });
        } else if (engine == 'gemini') {
            $webview.attr('src', `https://gemini.google.com/`);

            document.getElementById('mainWebview').addEventListener('did-finish-load', () => {
                document.getElementById('mainWebview').executeJavaScript(`
                  const signin = document.querySelector('.gb_Ea[aria-label="Sign in"]');
                  if (document.querySelector('.ql-editor.textarea>p') && document.querySelector('.send-button') && !signin) {
                    document.querySelector('.ql-editor.textarea>p').innerText = "${url}";
                    setTimeout(function () {
                        document.querySelector('.send-button').click();
                    }, 250)
                  } else {
                    console.log('Sign into Google and then try again.');
                    window.postMessage({ type: 'site-info', data: '' }, '*');
                    alert('Sign into Google and then try again.');
                   }
                `)
            });
        } else if (engine == 'bing') {
            $webview.attr('src', `https://www.bing.com/search?q=${encodeURIComponent(url)}`);
        } else if (engine == 'copilot') {
            $webview.attr('src', `https://gemini.google.com/`);

            document.getElementById('mainWebview').addEventListener('did-finish-load', () => {
                document.getElementById('mainWebview').executeJavaScript(`
                  const signin = document.querySelector('.gb_Ea[aria-label="Sign in"]');
                  if (document.querySelector('.ql-editor.textarea>p') && document.querySelector('.send-button') && !signin) {
                    document.querySelector('.ql-editor.textarea>p').innerText = "${url}";
                    setTimeout(function () {
                        document.querySelector('.send-button').click();
                    }, 250)
                  } else {
                    console.log('Sign into Google and then try again.');
                    window.postMessage({ type: 'site-info', data: '' }, '*');
                    alert('Sign into Google and then try again.');
                   }
                `)
            });
        }
    }
    urlInput.blur();
}

// $(window).on('message', (e) => {
//     if (e.data.type === 'site-info') {
//     }
// });

window.addEventListener('message', function (event) {
    if (event.data.type === 'site-info') {
        // ipcRenderer.send('from-webview', event.data.data);
        showHeadsUp('Sign in', 'Sign into Google to use Gemini', 3)
    }
});

urlInput.on('focus', () => {
    urlInput.select();
});

// On click

$('.appVer').on('click', function (e) {
    ipcRenderer.send('open-prefs', "What's New?")
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

$('#prefsBtn').on('click', function () {
    ipcRenderer.send('open-prefs', 'General')
});

$('select').on('mousedown', function (event) {
    event.preventDefault();

    $(this).focus().click();
});

$('.navBtn:not(.prefsBtn)').on('mousedown', function (event) {
    event.preventDefault();

    $(this).focus().click();
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
        let favicon = offlineImg;

        if (currentFavi && currentFavi.favicons && currentFavi.favicons.length > 0) {
            favicon = currentFavi.favicons[currentFavi.favicons.length - 1];
        }

        const $latentFavi = $('.latent-favi');

        $latentFavi.on('error', function () {
            $(this).attr('src', offlineImg);
        });

        $latentFavi.attr('src', favicon);
    } catch (error) {
        if (error instanceof TypeError) {
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

    const isBookmarked = savedURLs.filter(item => item !== null).some(item => item.url === currentURL);

    if (isBookmarked) {
        $('.bookmarkBtn').addClass('bookmarked');
    } else {
        $('.bookmarkBtn').removeClass('bookmarked');
    }
}

function saveBookmark() {
    const currentURL = $webview[0].getURL();
    const title = $webview[0].getTitle();
    let newFav;

    if (currentFavi && currentFavi.favicons && currentFavi.favicons.length > 0) {
        newFav = currentFavi.favicons[currentFavi.favicons.length - 1];
    } else {
        newFav = offlineImg;
    }

    let savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];

    if ($('.launchpad').children('.bookmark-item').length <= 9) {
        $('.launchpad').removeClass('override-altBookmark');
    } else if ($('.launchpad').children('.bookmark-item').length >= 10) {
        showHeadsUp("Compact mode enabled", `You have ${savedURLs.length} bookmark(s) saved; compacting to save space`, 7);
        $('.launchpad').addClass('override-altBookmark');
    } else if ($('.launchpad').children('.bookmark-item').length >= 16) {
        showHeadsUp("Couldn't save bookmark", "You have the maximum 16 bookmarks saved.", 7);
        return;
    }

    if (!savedURLs.some(item => item && item.url === currentURL)) {
        captureAndSaveBookmark(currentURL, title, newFav, savedURLs);
    } else {
        if (confirm('Bookmark for this URL already exists. Do you want to save it anyway?')) {
            captureAndSaveBookmark(currentURL, title, newFav, savedURLs);
        } else {
            showHeadsUp("Cancelled", "Bookmark not saved.", 7);
        }
    }
}

function captureAndSaveBookmark(currentURL, title, favicon, savedURLs) {
    $webview[0].capturePage().then(image => {
        let screenshot = image.toDataURL();

        const newBookmark = { id: '', title, url: currentURL, favicon, screenshot };
        savedURLs.push(newBookmark);

        savedURLs = renumberBookmarks(savedURLs);

        localStorage.setItem('savedURLs', JSON.stringify(savedURLs));
        ipcRenderer.send('setBookmarks', JSON.stringify(savedURLs));

        recallBookmarks();

        showHeadsUp("Bookmark saved", `You have ${savedURLs.length} bookmark(s) saved; Head to the home page, or hover up here to preview & edit`, 7);
    });
}

function updateBookmarkOrder(newOrderIds) {
    let savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];
    savedURLs = savedURLs.filter(item => item !== null);

    const newOrder = newOrderIds.map(id => savedURLs.find(item => item.id === id));

    savedURLs = renumberBookmarks(newOrder);

    localStorage.setItem('savedURLs', JSON.stringify(savedURLs));

    recallBookmarks();
}

function renumberBookmarks(bookmarks) {
    return bookmarks.map((bookmark, index) => {
        bookmark.id = 'item' + (index + 1);
        return bookmark;
    });
}

function recallBookmarks() {
    let savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];
    savedURLs = savedURLs.filter(item => item !== null);
    const animationDelay = 0.1;

    $('.bookmark-item').remove();

    savedURLs.forEach((item, index) => {
        if (item === null) return; // Skip null items

        const bookmarkItem = $('<div></div>', {
            class: 'bookmark-item',
            id: `bookmark-${index}`,
            'data-id': item.id, // Store the item ID for sorting
            title: item.url,
            url: item.url
        });

        if (index < 10) {
            bookmarkItem.attr('index', index);
            bookmarkItem.addClass('hotkey');
        }

        bookmarkItem.on('contextmenu', function (event) {
            event.preventDefault();
            ipcRenderer.send('show-context-menu', item.id);
        });

        const bookmarkInfo = $('<div>', {
            class: 'bookmark-info'
        });

        const faviconImg = $('<div>', {
            alt: item.title,
            class: 'favicon'
        });

        // Set favicon image or fallback to offlineImg on error
        faviconImg.on('error', function () {
            $(this).attr('style', `background-image: url(${offlineImg});`);
        }).attr('style', `background-image: url(${item.favicon});`);

        const cleanUrl = item.url.replace(/^(http:\/\/|https:\/\/)/, '');
        const $titleText = $('<div></div>', {
            text: item.title,
            url: item.url,
            cleanUrl: cleanUrl,
            class: 'bookmark-text'
        });

        bookmarkInfo.append(faviconImg);
        bookmarkInfo.append($titleText);

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
            $screenshotImg.attr('style', `background-image: url(${item.screenshot});`);

            bookmarkItem.append($screenshotImg);
        }

        bookmarkItem.append(bookmarkInfo);
        bookmarkItem.css('animation-delay', `${(animationDelay * index) + 0.2}s`);

        launchpad.append(bookmarkItem);

        if ($('.launchpad').children('.bookmark-item').length <= 9) {
            $('.launchpad').removeClass('override-altBookmark');
        } else if ($('.launchpad').children('.bookmark-item').length >= 10) {
            $('.launchpad').addClass('override-altBookmark');
        }

        if (launchpad[0].scrollWidth > launchpad[0].clientWidth) {
            launchpad.addClass('overflow');
        } else {
            launchpad.removeClass('overflow');
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

    // Initialize jQuery UI sortable
    launchpad.sortable({
        items: '.bookmark-item',
        scroll: false,
        update: function (event, ui) {
            const newOrderIds = $(this).sortable('toArray', { attribute: 'data-id' });
            updateBookmarkOrder(newOrderIds);
        },
        start: function (event, ui) {
            ui.item.data('dragging', true);
        },
        stop: function (event, ui) {
            setTimeout(() => ui.item.data('dragging', false), 1);
        }
    });
}

function updateScreenshotIfBookmarked(url) {
    let savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];
    let bookmarkedItem = savedURLs.filter(item => item !== null).find(item => item.url === url);

    if (bookmarkedItem) {
        $webview[0].capturePage().then(image => {
            let newScreenshot = image.toDataURL();
            bookmarkedItem.screenshot = newScreenshot;
            localStorage.setItem('savedURLs', JSON.stringify(savedURLs.filter(item => item !== null)));
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
        $('#changesDiv').removeClass('show');
        $('.versionDiv').removeClass('show')
        $('#appVerText').text(localStorage.getItem('currentVer'))
    }
    if (!$.contains($('#editModal')[0], e.target)) {
        $('#editModal').removeClass('show');
    }
});

$(document).on('mousemove', function (e) {
    if (!$(e.target).hasClass('bookmark-item')) {
        $('.bookmark-item').removeData('dragging');
    }
})

$(document).on('keydown', (event) => {
    if (document.activeElement && document.activeElement !== document.body) {
        return;
    }

    if (event.metaKey && event.key >= '0' && event.key <= '9') {
        const index = parseInt(event.key, 10);

        if (launchpad.length && launchpad.is(':visible')) {
            const $childDivs = launchpad.children();

            if (index < $childDivs.length) {
                $childDivs.eq(index).click();
            }
        }
    }

    if (event.metaKey && event.key == ',') {
        ipcRenderer.send('toggle-prefs');
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
    $(this).removeClass('travel');
    $(this).removeData('dragging');
});

// ipcRenderer.on()

function engineCheck() {
    let engine = localStorage.getItem('searchEngine');
    if (engine == 'google') {
        $('#urlBar').attr('placeholder', 'Search Google or enter URL');
    } else if (engine == 'gemini') {
        $('#urlBar').attr('placeholder', 'Ask Gemini or enter URL');
    } else if (engine == 'chatgpt') {
        $('#urlBar').attr('placeholder', 'Ask ChatGPT or enter URL');
    } else if (engine == 'bing') {
        $('#urlBar').attr('placeholder', 'Search Bing or enter URL');
    } else if (engine == 'copilot') {
        $('#urlBar').attr('placeholder', 'Ask Copilot or enter URL');
    }
}

ipcRenderer.on('bookmark-style', (e) => {
    $('.launchpad').attr('bookmarkstyle', localStorage.getItem('bookmarkStyles'));
    recallBookmarks();
})

ipcRenderer.on('searchEngine', (e) => {
    engineCheck();
})

ipcRenderer.on('runFnFromPrefs', (e, fnName) => {
    window[fnName]();
})

ipcRenderer.on('aot-tray', (event, newAOT) => {
    localStorage.setItem('alwaysOnTop', newAOT);
});

ipcRenderer.on('focus-urlbar', () => {
    urlInput.focus();
});

ipcRenderer.on('appVer', (e, ver) => {
    localStorage.setItem('currentVer', ver)
    $('#appVerText').text(`v${localStorage.getItem('currentVer')}`);
});

ipcRenderer.on('global-shortcut', (e, state) => {
    localStorage.setItem('globalHotkey', state);
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