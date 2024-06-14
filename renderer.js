const { ipcRenderer, clipboard } = require('electron');

const webview = $('.mainWebview');
const urlInput = $('#urlBar');
const backButton = $('#navBack');
const forwardButton = $('#navFrwd');
const launchpad = $('#launchpad');

let curl;
let currentFavi;
let aot;
let windowSize;
let isDragging = false;
let startX, startY;
let currentBookmarkId;
let canGoBack, canGoForward, canReload = false;

$(window).on('load', function () {
    aot = localStorage.getItem('alwaysOnTop') || true;
    ipcRenderer.send('setAOT', aot);

    if (localStorage.getItem('screenshotLab') === 'true') {
        $('body').addClass('altBookmark');
    } else {
        $('body').removeClass('altBookmark');
    }

    windowSize = JSON.parse(localStorage.getItem('windowSize') || '{"width":800,"height":600}');
    if (!windowSize.width || !windowSize.height) {
        localStorage.setItem('windowSize', JSON.stringify({ width: 800, height: 600 }));
    }

    webview.on('did-navigate did-frame-finish-load did-finish-load did-navigate-in-page page-title-updated dom-ready', handleWebviewEvents);

    webview.on('did-finish-load', function () {
        updateURL();
        updateButtonStates();
        vibrancyLab();
        screenshotLab();
        setTimeout(() => {
            updateScreenshotIfBookmarked(curl);
        }, 5000);
    });

    document.getElementById('mainWebview').addEventListener('page-favicon-updated', function (favicon) {
        currentFavi = favicon;
    })

    if (localStorage.getItem('vibrancyLab') === 'true') {
        $('#vibrancyLabToggle').prop('checked', true);
    }

    if (localStorage.getItem('screenshotLab') === 'true') {
        $('#screenshotLabToggle').prop('checked', true);
    }

    recallBookmarks();

    $('body').addClass('loaded');

    showHeadsUp('PopHome', 'Welcome back!', 7)
});

ipcRenderer.on('appver', (e, ver) => {
    $('#appVerText').text(`v${ver}`);
});

$('#appVerText').on('click', (e) => {
    ipcRenderer.send('changes');
    $('#changesDiv').toggleClass('show');
});

$(document).on('click', (e) => {
    if (!$.contains($('#changesDiv')[0], e.target) && !$.contains($('.appver')[0], e.target)) {
        $('#changesDiv').removeClass('show');
    }
    if (!$.contains($('#labsContainer')[0], e.target)) {
        $('#labsContainer').removeClass('open');
    }
});

ipcRenderer.on('global-hotkey', (e, state) => {
    localStorage.setItem('globalHotkey', state);
});

ipcRenderer.on('changes', (event, content) => {
    const $changes_iframe = $('#iframe-changes');
    $changes_iframe.attr('src', 'data:text/html;charset=utf-8,' + encodeURIComponent(`
        <style>
            body {
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                font-size: .9em;
                padding: 20px;
            }
            h3 {
                margin-top: 20px;
                margin-bottom: 5px;
                position: relative;
            }
            h3:first-of-type {
                margin-top: 0;
            }
            h3:first-of-type::before {
                content: '(Current)';
                margin-right: 5px;
            }
            h3:not(h3:first-of-type)::after {
                content: '';
                width: 100%;
                height: 1px;
                opacity: 50%;
                position: absolute;
                top: -10px;
                left: 0;
            }
            ul {
                list-style-type: disc;
                margin: 5px 0 15px 20px;
                padding: 0;
            }
            ul ul {
                list-style-type: circle;
                margin-left: 20px;
                margin-top: 0;
                margin-bottom: 0;
            }
            li {
                margin: 5px 0;
            }
            b {
                font-weight: bold;
            }
            @media (prefers-color-scheme: light) {
                h3:not(h3:first-of-type)::after {
                    background-color: black;
                }
                body {
                    color: black;
                }
            }
            @media (prefers-color-scheme: dark) {
                h3:not(h3:first-of-type)::after {
                    background-color: white;
                }
                body {
                    color: white;
                }
            }            
        </style>
        ${content}
    `));
});

function showHeadsUp(title, message, time) {
    $('.headsUp .title').text(title)
    $('.headsUp .message').text(message)
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
    ipcRenderer.send('nav', {
        canGoBack: webview[0].canGoBack(),
        canGoForward: webview[0].canGoForward(),
        canReload: !curl.includes('about:blank')
    });
}

function updateButtonStates() {
    backButton.prop('disabled', !webview[0].canGoBack());
    forwardButton.prop('disabled', !webview[0].canGoForward());
}

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
    }
});

const updateURL = () => {
    curl = webview[0].getURL();
    urlInput.val(curl.replace('https://', '').replace('http://', ''));

    if (curl !== 'about:blank') {
        $('.popHome').addClass('hide');
    } else {
        $('.popHome').removeClass('hide');
        urlInput.val('');
    }

    if (curl.indexOf('data:') === 0) {
        urlInput.val('');
    }
};

document.getElementById('mainWebview').addEventListener('did-fail-load', (event) => {
    if (event.errorCode === -105) {
        const failedUrl = urlInput.val().trim();
        webview.attr('src', `https://www.google.com/search?q=${encodeURIComponent(failedUrl)}`);
    }
});

ipcRenderer.on('window-focus', function () {
    recallBookmarks();
    $('body').removeClass('blur')
    const commonExtensions = [
        '.com', '.net', '.org', '.edu', '.gov', '.mil',
        '.co', '.io', '.app', '.dev', // Newer extensions
        '.co.uk', '.uk', '.ca', '.au', '.de', '.fr', '.jp', '.cn', // Country codes
        // ... add more as needed
    ];

    for (const extension of commonExtensions) {
        if (clipboard.readText().trim().includes(extension)) {
            showHeadsUp('Open Link?', `${clipboard.readText().trim()}`, 5);
            return; // Exit after finding the first match
        }
    }
});

ipcRenderer.on('window-blur', function () {
    $('body').addClass('blur')
});

ipcRenderer.on('focus', function () {
    launchpad.click();
});

ipcRenderer.on('reload-wv', function () {
    webview[0].reload();
});

urlInput.on('keydown', (event) => {
    if (event.key === 'Enter') {
        let url = urlInput.val().trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url;
        } else {
            url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        }
        webview.attr('src', url);
        urlInput.blur();
    }
});

urlInput.on('focus', () => {
    urlInput.select();
});

ipcRenderer.on('aot-tray', (event, newAOT) => {
    localStorage.setItem('alwaysOnTop', newAOT);
});

ipcRenderer.on('focus-urlbar', () => {
    urlInput.focus();
});

$('#moreBtn').on('click', function () {
    ipcRenderer.send('show-cm');
});

ipcRenderer.on('webview-devtools', () => {
    webview[0].openDevTools();
});

ipcRenderer.on('webview-focus', () => {
    webview[0].focus();
});

$('#vibrancyLabToggle').on('change', function () {
    localStorage.setItem('vibrancyLab', $(this).prop('checked'));
    vibrancyLab();
});

function vibrancyLab() {
    if (localStorage.getItem('vibrancyLab') === 'true') {
        const css = `
            body,
            html {
                background: transparent !important;
            }
        `;
        try {
            webview[0].insertCSS(css);
            console.log('CSS injected successfully');
        } catch (error) {
            console.error('Error reading or injecting CSS:', error);
        }
    }
}

$('#screenshotLabToggle').on('change', function () {
    localStorage.setItem('screenshotLab', $(this).prop('checked'));
    screenshotLab();
});

function screenshotLab() {
    if (localStorage.getItem('screenshotLab') === 'true') {
        $('body').addClass('altBookmark');
    } else {
        $('body').removeClass('altBookmark');
    }
}

ipcRenderer.on('save-bookmark', saveBookmark);

$('#bookmarkBtn').on('click', saveBookmark);

function saveBookmark() {
    const currentURL = webview[0].getURL();
    const title = webview[0].getTitle();
    let newFav = currentFavi.favicons[currentFavi.favicons.length - 1] || './nofav.png';
    let savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];

    // Check if there are already 9 bookmarks saved
    if (savedURLs.length >= 9) {
        alert('You already have 9 bookmarks saved. No more can be saved.');
        return; // Cancel the saving process
    }

    // Proceed if the current URL is not already bookmarked
    if (!savedURLs.some(item => item.url === currentURL)) {
        captureAndSaveBookmark(currentURL, title, newFav, savedURLs);
    } else {
        if (confirm('Bookmark for this URL already exists. Do you want to save it anyway?')) {
            captureAndSaveBookmark(currentURL, title, newFav, savedURLs);
        } else {
            alert('Bookmark not saved.');
        }
    }
}

function captureAndSaveBookmark(currentURL, title, favicon, savedURLs) {
    webview[0].capturePage().then(image => {
        let screenshot = image.toDataURL();
        const bookmarkIndex = savedURLs.length + 1;

        // Create the new bookmark without the id first
        const newBookmark = { id: 'item' + bookmarkIndex, title, url: currentURL, favicon, screenshot };
        savedURLs.push(newBookmark);

        // Get the index of the newly added bookmark

        // Update the bookmark to include the id
        // savedURLs[bookmarkIndex - 1].id = ;

        // Save the updated bookmarks to localStorage and send them to ipcRenderer
        localStorage.setItem('savedURLs', JSON.stringify(savedURLs));
        ipcRenderer.send('setBookmarks', JSON.stringify(savedURLs));

        alert('Bookmark saved! Head over to PopHome to view.');
    });
}

function recallBookmarks() {
    const savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];
    const animationDelay = 0.1; // Adjust as needed

    launchpad.empty();

    savedURLs.forEach((item, index) => {
        const bookmarkItem = $('<div></div>', {
            class: 'bookmark-item',
            id: `bookmark-${index + 1}`,
            url: item.url
        });

        bookmarkItem.attr('index', index + 1);

        bookmarkItem.on('contextmenu', function (event) {
            event.preventDefault();
            ipcRenderer.send('show-context-menu', item.id);
        });

        const faviconImg = $('<img>', {
            src: item.favicon,
            alt: item.title,
            class: 'favicon'
        });

        const cleanUrl = item.url.replace(/^(http:\/\/|https:\/\/)/, '');
        const $titleLabel = $('<div></div>', {
            class: 'bookmark-title',
            url: `${item.url}`,
            title: cleanUrl
        });

        $titleLabel.append(faviconImg);

        const $titleText = $('<div></div>', {
            text: item.title,
            title: item.title,
            class: 'bookmark-text'
        });

        $titleLabel.append($titleText)

        bookmarkItem.on('click', function () {
            webview.attr('src', $(this).attr('url'));
            urlInput.val($(this).attr('url').replace('https://', '').replace('http://', ''));
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

        // Apply animation delay
        bookmarkItem.css('animation-delay', `${(animationDelay * index) + .2}s`);

        launchpad.append(bookmarkItem);
    });

    // Initialize jQuery UI Sortable
    $('#launchpad').sortable({
        items: '.bookmark-item',
        update: function (event, ui) {
            // Get the new order of elements
            const newOrder = $(this).sortable('toArray', { attribute: 'id' });

            // Map the new order to savedURLs
            const newSavedURLs = newOrder.map(id => {
                const index = id.split('-')[1] - 1;
                return savedURLs[index];
            });

            // Save the new order to localStorage
            localStorage.setItem('savedURLs', JSON.stringify(newSavedURLs));
            recallBookmarks();
        }
    });

    ipcRenderer.on('edit-bookmark', (event, bookmarkId) => {
        editBookmark(bookmarkId);
    });
}

$('#labsHeader').on('click', function () {
    $('#labsContainer').toggleClass('open');
});

$('#navBack').on('click', function () {
    webview[0].goBack();
});

$('#navFrwd').on('click', function () {
    webview[0].goForward();
});

$('#homeBtn').on('click', function () {
    ipcRenderer.send('reload');
});

webview.on('dom-ready', function () {
    webview[0].insertCSS('::-webkit-scrollbar { display: none; }');
    webview[0].setAudioMuted(true);
});

$(window).on('resize', function () {
    const currentWindowSize = {
        width: $(window).width(),
        height: $(window).height()
    };
    localStorage.setItem('windowSize', JSON.stringify(currentWindowSize));
});

webview.on('new-window', (e) => {
    webview[0].attr('src', e.url);
});

webview.on('will-navigate', function (event, url) {
    updateScreenshotIfBookmarked(url);
});

function updateScreenshotIfBookmarked(url) {
    let savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];
    let bookmarkedItem = savedURLs.find(item => item.url === url);

    if (bookmarkedItem) {
        webview[0].capturePage().then(image => {
            let newScreenshot = image.toDataURL();
            bookmarkedItem.screenshot = newScreenshot;
            localStorage.setItem('savedURLs', JSON.stringify(savedURLs));
        });
    }
}

$(document).on('keydown', (event) => {
    if (document.activeElement && document.activeElement !== document.body) {
    } else {
        if (event.key >= '1' && event.key <= '9') {
            const index = parseInt(event.key, 10) - 1;

            if (launchpad.length && launchpad.is(':visible')) {
                const $childDivs = launchpad.children();

                if (index < $childDivs.length) {
                    $childDivs.eq(index).click();
                }
            }
        }
    }
});

// modal

function editBookmark(bookmarkId) {
    const savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];
    const bookmark = savedURLs.find(item => item.id === bookmarkId);

    if (!bookmark) {
        console.error('Bookmark not found');
        return;
    }

    // Populate both input fields
    $('#newBookmarkName').val(bookmark.title);
    $('#newBookmarkURL').val(bookmark.url);

    // Update the modal title for clarity
    $('.bkTitle').text(`Edit "${bookmark.title}"`);

    // Store the bookmark ID for later reference
    currentBookmarkId = bookmarkId;

    $('#editModal').addClass('show');
    $('#newBookmarkName').focus();
}

function performEdit() { // Renamed for clarity
    const newName = $('#newBookmarkName').val().trim();
    const newURL = $('#newBookmarkURL').val().trim();

    if (!newName || !newURL) {
        alert('Please enter a valid name and URL.');
        return;
    }

    const savedURLs = JSON.parse(localStorage.getItem('savedURLs')) || [];
    const bookmarkIndex = savedURLs.findIndex(item => item.id === currentBookmarkId);

    if (bookmarkIndex === -1) {
        console.error('Bookmark not found');
        return;
    }

    // Update both title and URL
    savedURLs[bookmarkIndex].title = newName;
    savedURLs[bookmarkIndex].url = newURL;

    localStorage.setItem('savedURLs', JSON.stringify(savedURLs));

    recallBookmarks();

    $('#editModal').removeClass('show');
}

$('.close').click(function () {
    $('#editModal').removeClass('show');
    setTimeout(() => {
        $('#newBookmarkName').val('');
        $('#newBookmarkURL').val('');
    }, 500);
});

$(window).click(function (event) {
    if (event.target.id === 'editModal') {
        $('#editModal').removeClass('show');
        $('#newBookmarkName').val('');
    }
});

$('#editButton').click(function () {
    performEdit();
});

$('#newBookmarkName').keypress(function (event) {
    if (event.which === 13) {
        performEdit();
    }
});