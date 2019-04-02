var bookmarks = {
    queue: [],
    expired: []
};

var dayThreshold;
var concurrentRequests;
var timeout;
var method;

var counter = 0;
var finishedCounter = 0;
var total = 0;

var $formOptions = document.getElementById('form-options');
var $start = document.getElementById('start');
var $options = document.getElementById('options');
var $dayThreshold = document.getElementById('day-threshold');
var $concurrentRequests = document.getElementById('concurrent-requests');
var $requestTimeout = document.getElementById('request-timeout');
var $httpMethod = document.getElementById('http-method');
var $progress = document.getElementById('progress');
var $progressInner = document.getElementById('progress-inner');
var $testingUrl = document.getElementById('testing-url');
var $filterBookmarks = document.getElementById('filter-bookmarks');
var $deleteAll = document.getElementById('delete-all');
var $table = document.getElementById('table');



function readBookmark(node, path) {
    var children = node.children;
    var isLink = !children;

    var opt = {
        title: node.title,
        url: node.url,
        id: node.id,
        date: node.dateAdded,
        fullPath: path.join(' > '),
        group: path[path.length - 1],
        status: 0
        // redirectTo: if 301, 302
    };

    if (isLink) {

        // Is valid URL?
        try {
            var url = new URL(node.url);
            if (url.host) {
                bookmarks.queue.push(opt);
            }
            else if (url.protocol === 'javascript:') {
                bookmarks.javascript.push(opt);
            }
            else if (url.protocol === 'file:') {
                bookmarks.local.push(opt);
            }
            else {
                bookmarks.invalid.push(opt);
            }
        }
        catch(e) {
            bookmarks.invalid.push(opt);
        }

        // bookmarks.all.push(opt);
        return;
    }

    // Is folder and title is not empty
    if (node.title) {
        path.push(node.title);
    }

    var i;
    var len = children.length;

    if (!len) {
        bookmarks.emptyFolder.push(opt);
    }

    for (i = 0; i < len; i++) {
        readBookmark(children[i], path.slice(0));
    }
}


function deleteBookmark(id, callback) {
    chrome.bookmarks.remove(id, function() {
        callback && callback(!chrome.runtime.lastError);
    });
}


function updateBookmark(id, opt, callback) {
    chrome.bookmarks.update(id, opt, function() {
        callback(!chrome.runtime.lastError);
    });
}


function isSameUrl(str1, str2) {
    var url1 = new URL(str1);
    var url2 = new URL(str2);

    return url1.protocol === url2.protocol &&
            url1.host === url2.host &&
            url1.pathname === url2.pathname &&
            url1.search === url2.search;
}


function httpRequest() {
    var bookmark = bookmarks.queue.shift();

    if (!bookmark) {
        finished();
        return;
    }

    var now = new Date();
    var urldate = new Date(bookmark.date);
    var days = parseInt((now - urldate)/(24*3600*1000));
    bookmark.status = days;
    if (days > dayThreshold)
        bookmarks.expired.push(bookmark);
    else {
        var group = bookmark.group;
        if (!bookmarks[group])
            bookmarks[group] = []
        bookmarks[group].push(bookmark);
    }
    httpRequest();
}


function finished() {
    finishedCounter++;

    if (finishedCounter < concurrentRequests) {
        // There are still http requests in progress
        return;
    }

    // Now it's over

    // Hide options (timeout, method, etc) and progress bar
    $formOptions.style.display = 'none';

    // Show filter (Error, server error, redirected, etc)
    $filterBookmarks.style.display = 'inline-block';

    // Show delete all button
    $deleteAll.style.display = 'inline-block';

    var txt = 'Expired (' + bookmarks["expired"].length + ')';
    $filterBookmarks.options.add(new Option(txt, "expired"));

    for (var name in bookmarks) {
        if (name == "queue" || name == "expired") continue
        txt = name + ' (' + bookmarks[name].length + ')';
        $filterBookmarks.options.add(new Option(txt, name));
    }

    // Show counter for each filter
    // Array.from($filterBookmarks).forEach(function(e) {
    //     e.innerHTML += ' (' + bookmarks[e.value].length + ')';
    // });

    // Show table via renderTemplate
    $filterBookmarks.dispatchEvent(new Event('change'));
}


function renderTemplate(list, opt) {
    var tpl;

    // Empty list
    if (!list.length) {
        $table.innerHTML = 'None';
        return;
    }

    opt = opt || {};

    // Table with 7 columns
    if (opt.redirect) {
        tpl = '<table class="redirect-to">';
    }

    // Table with 5 columns
    else {
        tpl = '<table>';
    }

    tpl += '<thead>';
    tpl += '<tr class="' + opt.classTr + '">';
    tpl += '<th class="td-code">Code</th>';
    tpl += '<th class="td-title">Title</th>';

    if (opt.redirect) {
        tpl += '<th class="td-url">URL</th>';
        tpl += '<th class="td-url" colspan="5">New URL</th>';
    }
    else {
        tpl += '<th class="td-url" colspan="4">URL</th>';
    }

    tpl += '</tr>';
    tpl += '</thead>';

    tpl += '<tbody>';


    var id;
    var code;
    var title;
    var fullPath;
    var url;
    var redirectTo;
    var editable = 'contentEditable spellcheck="false"';

    for (var i = 0, len = list.length; i < len; i++) {
        id = list[i].id;
        code = list[i].status;
        title = htmlEscape(list[i].title);
        fullPath = htmlEscape(list[i].fullPath);
        url = list[i].url;
        redirectTo = htmlEscape(list[i].redirectTo);

        tpl += '<tr data-id="' + id + '" data-array="' + opt.classTr + '">';
        tpl += '<td class="td-code">' + code + '</td>';
        tpl += '<td class="td-title" ' + editable + ' title="' +
            fullPath + '">' + title + '</td>';


        if (url) {
            url = htmlEscape(url);
            tpl += '<td class="td-url" ' + editable + '>' + url + '</td>';
        }
        // URL is undefined when bookmark is an empty folder
        else {
            url = 'chrome://bookmarks/?id=' + id;
            tpl += '<td class="td-url">' + url + '</td>';
        }

        if (opt.redirect) {
            tpl += '<td class="td-url">' + redirectTo + '</td>';
        }

        tpl += '<td class="td-link" title="Visit link &#34;' +
            limitString(url, 40) + '&#34;"></td>';
        tpl += '<td class="td-remove" title="Remove bookmark &#34;' + title +
            '&#34;"></td>';
        tpl += '<td class="td-archive" title="Archive page"></td>';

        if (opt.redirect) {
            tpl += '<td class="td-update" title="Update URL to &#34;' +
                limitString(redirectTo, 40) + '&#34;"></td>';
        }

        tpl += '</tr>';
    }

    tpl += '</tbody>';
    tpl += '</table>';

    $table.innerHTML = tpl;
}


function htmlEscape(str) {
    var map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&#34;',
        "'": '&#39;'
    };

    return ('' + str).replace(/[&<>"']/g, function(match) {
        return map[match];
    });
}

function addEvent(obj, type, callback) {
    obj.addEventListener(type, callback);
}

function limitString(str, size) {
    if (str.length > size) {
        str = str.substr(0, size) + '...';
    }
    return str;
}

function updateBookmarkCount(type, count) {
    var $option = $filterBookmarks.querySelector('[value="' + type + '"]');

    // Remove current counter from <option>
    var html = $option.innerHTML.split(' ');
    html.pop();

    // Set new counter to <option>
    html.push('(' + count + ')');
    html = html.join(' ');
    $option.innerHTML = html;

    if (!count) {
        $table.innerHTML = 'None';
    }
}


// Press Start
addEvent($formOptions, 'submit', function(e) {
    e.preventDefault();

    // Set options
    dayThreshold = +$dayThreshold.value;
    concurrentRequests = +$concurrentRequests.value;
    timeout = $requestTimeout.value * 1000;
    method = $httpMethod.value;

    $start.style.display = 'none';
    $options.style.display = 'none';
    $progress.style.display = 'block';

    chrome.bookmarks.getTree(function(nodes) {

        // Read all bookmarks recursively and set the variable bookmarks.queue
        readBookmark(nodes[0], []);

        total = bookmarks.queue.length;

        for (var i = 0; i < concurrentRequests; i++) {
            httpRequest();
        }
    });
});


// Change filter
addEvent($filterBookmarks, 'change', function() {
    var value = this.value;
    var isRedirect = value === 'redirect';

    renderTemplate(bookmarks[value], {
        classTr: value,
        redirect: isRedirect
    });
});


// Delete all
addEvent($deleteAll, 'click', function(e) {
    e.preventDefault();

    var type = $filterBookmarks.value;

    if (type === 'ok') {
        alert('You should not delete all your bookmarks that are working at once');
        return;
    }

    if (confirm('Are you sure?')) {
        bookmarks[type].forEach(function(bookmark) {
            deleteBookmark(bookmark.id);
        });

        updateBookmarkCount(type, 0);
    }
});

// Click remove, update or link
addEvent($table, 'click', function(e) {
    var $target = e.target;
    var $parent = $target.parentNode;
    var className = $target.className;
    var bookmarkId;
    var bookmarkUrl;
    var bookmarkRedirectUrl;

    function deleteElement() {
        var type = $parent.getAttribute('data-array');

        // Remove element from bookmarks.ok (or bookmarks.error, etc...)
        bookmarks[type] = bookmarks[type].filter(function(e) {
            return e.id !== bookmarkId;
        });

        // Remove line from HTML
        $parent.parentNode.removeChild($parent);

        var count = bookmarks[type].length;

        updateBookmarkCount(type, count);
    }

    if (className === 'td-remove') {
        bookmarkId = $parent.getAttribute('data-id');

        deleteBookmark(bookmarkId, function(success) {
            if (success) {
                deleteElement();
            }
        });
    }

    else if (className === 'td-update') {
        bookmarkId = $parent.getAttribute('data-id');
        bookmarkRedirectUrl = $parent.children[3].innerText;

        var opt = {
            url: bookmarkRedirectUrl
        };

        updateBookmark(bookmarkId, opt, function(success) {
            if (success) {
                deleteElement();
            }
        });
    }

    else if (className === 'td-link') {
        bookmarkUrl = $parent.children[2].innerText;

        chrome.tabs.create({
            url: bookmarkUrl
        });
    }

    else if (className === 'td-archive') {
        bookmarkUrl = $parent.children[2].innerText;

        chrome.tabs.create({
            url: 'http://archive.is/?run=1&url=' +
                encodeURIComponent(bookmarkUrl)
        });
    }
});


// Change title or URL
addEvent($table, 'input', function(e) {
    var $target = e.target;
    var $parent = $target.parentNode;
    var className = $target.className;

    var bookmarkId = $parent.getAttribute('data-id');
    var text = $target.innerText;

    // Changing title or URL
    var opt = className === 'td-title' ? {title: text} : {url: text};

    updateBookmark(bookmarkId, opt, function() {});
});
