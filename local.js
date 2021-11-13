function createHttpRequest(method, link, body, onsuccess, onerror){
    let http = new XMLHttpRequest()
    http.open(method, link);
    http.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    http.setRequestHeader("Content-Type", "application/json");
    http.send(body)
    http.onreadystatechange = function(){
        if (http.readyState != 4) return;
        if (http.status == 200) {onsuccess(http)} else {onerror(http)}
    }
}

let link = document.createElement('link');
link.rel = 'stylesheet';
link.href = host + '/style';
document.head.prepend(link);

var id = null;
var token = null;
if (document.getElementsByClassName('header__subitem-head')[0]){
    id = Number(document.getElementsByClassName('header__subitem-head')[0].children[0].href.match(/\.([0-9]*)\//)[1]);
    token = document.getElementById('token').getAttribute('data-value');
};

//authorize
if (id){
    createHttpRequest('POST', host + '/getThreadsBg', JSON.stringify({ids: [818100]}), function(http){
        var bg_result = JSON.parse(http.responseText);
        for (let thread_msg_element of document.querySelectorAll('.forum-theme__item.forum-theme__block')){
            let id = thread_msg_element.querySelector('.forum-theme__item-avatar').href.match(/\.([0-9]*)\//)[1];
            if (bg_result[id]){
                thread_msg_element.style.backgroundImage = `linear-gradient(to left, #26272ce3, #26272ce3), url('${bg_result[id]}')`
            }
        }
    })
    var settings_button = document.createElement('li');
    settings_button.classList.add('header__item');
    settings_button.innerHTML = `<a class='header__link custon-settings-icon' onclick="toggleCustomSettingsPanel()"><img src="${host}/settingsIcon"></a>`
    document.getElementsByClassName('header__list')[0].prepend(settings_button)

    var settings_panel = document.createElement('div');
    settings_panel.id = "custon-settings-panel";
    settings_panel.innerHTML = `<div>
        <div class='close' onclick="toggleCustomSettingsPanel()">Закрыть</div>
        <h2>Настройки</h2>
        <span id='custom-settings-error'></span>
        <div>
        <div id='custom-settings-paginator'>
            <div class='selected'>Фон постов</div>
            <div>Скоро будет больше...</div>
        </div>
        <div id='main-settings-container'>
            <div class='visible'>
                <p>Изображение для заднего фона</p>
                <input type='file' id='thread-bg' accept="image/png, image/jpg, image/jpeg, image/gif">
                <p>или...</p>
                <input type='text' placeholder="Ссылка на изображение" id='thread-link'>
                <div class='row'>
                    <input type='submit' value='Отправить' onclick='updateThreadBg()'><input type='submit' value='Удалить' onclick='removeThreadBg()'>
                </div>
            </div>
        </div>
        </div>
        </div>`;
    document.body.append(settings_panel)

    for (let i = 0; i < document.getElementById('custom-settings-paginator').children.length; i++){
        document.getElementById('custom-settings-paginator').children[i].onclick = function(){
            selectCustomSettingsTab(i)
        }
    }
    function toggleCustomSettingsPanel(){
        document.getElementById('custon-settings-panel').classList.toggle('visible')
    }
    function selectCustomSettingsTab(i){
        var settings_pages = document.getElementById('main-settings-container').children;
        var settings_pagin =  document.getElementById('custom-settings-paginator').children;
        for (let j = 0; j < settings_pages.length; j++){
            settings_pages[j].classList.remove('visible');
            settings_pagin[j].classList.remove('selected');
            if (j == i) {
                console.log(i, j)
                settings_pages[i].classList.add('visible');
                settings_pagin[i].classList.add('selected');
            }
        }
    }

    var thread_bg_data;
    function updateThreadBg(){
        updateSettingsStatus();
        var thread_file = document.getElementById('thread-bg').files[0];
        if (!thread_file){
            createHttpRequest('POST', host + '/updateThreadBg', JSON.stringify({
                token: token,
                data: undefined,
                link: document.getElementById('thread_link').value})
            , function(){
                updateSettingsStatus("Успешно!")
                document.getElementById('thread-bg').value = '';
            }, function(){
                updateSettingsStatus('Произошла ошибка!')
                document.getElementById('thread-bg').value = '';
            })
        }
        if (!thread_file.type.includes('image')) {
            document.getElementById('thread-bg').value = '';
        }
        var reader = new FileReader();
        reader.readAsDataURL(thread_file);
        reader.onload = function(){
            createHttpRequest('POST', host + '/updateThreadBg', JSON.stringify({
                token: token,
                data: reader.result,
                link: undefined
            }), function(){
                updateSettingsStatus("Успешно!")
                document.getElementById('thread-bg').value = '';
            }, function(){
                updateSettingsStatus('Произошла ошибка!')
                document.getElementById('thread-bg').value = '';
            });
        }
        
    }
    function removeThreadBg(){
        createHttpRequest('POST', host + '/updateThreadBg', JSON.stringify({
            token: token,
            data: null,
            link: null})
        , function(){
            updateSettingsStatus("Успешно!")
            document.getElementById('thread-bg').value = '';
        }, function(){
            updateSettingsStatus('Произошла ошибка!')
            document.getElementById('thread-bg').value = '';
        })
    }
    function updateSettingsStatus(text){
        if (!text) text = '';
        document.getElementById('custom-settings-error').innerText = text;
    }
}

// memes button fixer
for (var btn of document.getElementsByClassName('memes__btn')){
    btn.onclick = function(e){e.stopPropagation()}
}

// create friend list
if (!sessionStorage.friendList){
    var follow_link = document.querySelector('.header__subitem-head').getElementsByTagName('a')[0].href + 'followers/';
    createHttpRequest('POST', follow_link, '{}', function(http){
        var ddoc = (new DOMParser()).parseFromString(http.responseText, 'text/html');
        var pages_count = 1;
        if (ddoc.getElementsByClassName('pagination')[0]){
            pages_count = ddoc.getElementsByClassName('pagination')[0].getAttribute('data-pages') || 1;
        }
        var friend_users = [];
        ddoc.querySelectorAll('.settings-page__block-splitter--item.settings-page__block-header-splitter').forEach(e => {
            friend_users.push(e.getAttribute('href').substring(6))
        })
        var i = 1;
        var friendEmitter = function(){
            if (++i > pages_count){
                sessionStorage.setItem('friendList', JSON.stringify(friend_users))
                initFriendsCustomBorders()
            }
            else{
                createHttpRequest('POST', follow_link + 'page-' + i, {}, function(http){
                    (new DOMParser()).parseFromString(http.responseText, 'text/html').querySelectorAll('.settings-page__block-splitter--item.settings-page__block-header-splitter').forEach(e => {
                        friend_users.push(e.getAttribute('href').substring(6))
                    })
                    friendEmitter();
                })
            }
        }
        friendEmitter()
    }, function(http){console.log(http.responseText)})
}

// ts, friends and ignores
var ts = document.getElementsByClassName('forum-theme__top-block-user');
if (ts.length) {
    ts = ts[0].getAttribute('href');
    document.querySelectorAll(`a.forum-theme__item-avatar[href="${ts.substring(7)}"]`).forEach(element => {
        element.children[0].classList.add('custom-ts')
    })
}
if (sessionStorage.friendList) initFriendsCustomBorders();
// if (sessionStorage.friendList) initFriendCustomBorders();

// notif panel
var custom_notification_panel = document.createElement('div');
custom_notification_panel.classList.add('custom-notification-panel');
custom_notification_panel.innerHTML = '<p>Секундочку...</p>'
document.querySelector(".header__link[href='/forum/notifications/']").prepend(custom_notification_panel);
function updateNotifications(){
    createHttpRequest('POST', 'https://dota2.ru/forum/api/notices/preload', JSON.stringify({page: 1, name: 'Все уведомления'}), function(http){
        var notif_result = '';
        JSON.parse(http.responseText).notices.forEach(function(note){
            var post_link = note.post_id ? ("/forum/posts/" + note.post_id + "/") : null
            var thread_link = note.topic_id ? ("/forum/threads/" + note.topic_id + "/") : null
            var wall_link = note.wall_post_id ? ("/forum/wall/" + note.wall_post_id + "/") : null
            var wall_comment_link = note.wall_comment_id ? ("/forum/wall-comment/" + note.wall_comment_id + "/") : null;
            var news_link = note.news_id ? ("/news/" + note.news_id + "/") : null;
            var main_link = news_link || wall_comment_link || wall_link || post_link || thread_link;
            var smile_image = '';
            if (note.smile_id) smile_image = `<img class='smile' src='${host}/smile/${note.smile_id}'>`
            notif_result += `
            <a href='${main_link}'>
                <object>
                    <div class='notices-body__items-item background ${note.is_readed == 1 ? '' : 'unreaded'}'>
                        <a href='${note.link}' class='notices-body__items-item-avatar'>
                            <img src='${note.avatar_link}' class='avatar icon'>
                        </a>
                        <div class='notices-body__items-item-content'>
                            <div class='description'>${note.description}</div>
                            <abbr data-time='${note.date_created}' class='date-time'>Сколько-то там времени назад</abbr>
                        </div>
                        ${smile_image}
                    </div>
                </object>
            </a>
            `
        custom_notification_panel.innerHTML = notif_result;
        anime2ruDateTimer()
        }, function(http){custom_notification_panel.innerHTML = "Произошла ошибка! Ацкий сволочь."});   
    })
}
updateNotifications()
setInterval(updateNotifications, 30000)

// create ignor list
// (function(){
//     if (!sessionStorage.ignoreList){
//         createHttpRequest('POST', 'https://dota2.ru/forum/settings/ignorelist/', '{}', function(http){
//             var ddoc = (new DOMParser()).parseFromString(http.responseText, 'text/html');
//             var pages_count = 1;
//             if (ddoc.getElementsByClassName('pagination')[0]){
//                 pages_count = ddoc.getElementsByClassName('pagination')[0].getAttribute('data-pages') || 1;
//             }
//             var ignor_users = [];
//             ddoc.querySelectorAll('.settings-page__block-splitter--item.settings-page__block-header-splitter').forEach(e => {
//                 ignor_users.push(e.getAttribute('href').substring(6));
//             })
//             var i = 1;
//             var ignorEmitter = function(){
//                 if (++i > pages_count){
//                     sessionStorage.setItem('ignoreList', JSON.stringify(ignor_users))
//                     console.log(ignor_users);
//                 }
//                 else{
//                     createHttpRequest('POST', 'https://dota2.ru/forum/settings/ignorelist/page-' + i, '{}', function(http){
//                         $(http.responseText)[0].querySelectorAll('.settings-page__block-splitter--item.settings-page__block-header-splitter').forEach(e => {
//                             ignor_users.push(e.getAttribute('href').substring(6));
//                         })
//                         ignorEmitter();
//                     })
//                 }
//             }
//             ignorEmitter()
//         })
//     }
// })();

// file upload
var image_upload_link;
function file_getter(file){
    if (!file) {
        clearImagePreview('Выберите или бросьте сюда изображение...');
        return;
    };
    if (!file.type.includes('image')) {
        clearImagePreview('Это не изображение! Попробуйте ещё раз...');
        return;
    };
    var reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = function(){
        var container = document.getElementById('custom-image-upload-container');
        image_upload_link = reader.result;
        container.innerHTML = '<div class="custom-image-preview"><img src="' + reader.result + '"><div><button onclick="sendImageToInputInReply()">Загрузить изображение</button><button onclick="clearImagePreview()">Удалить изображение</button></div></div>'
    }
}
function sendImageToInputInReply(){
    createHttpRequest('POST', host + "/uploadImage", JSON.stringify({data: image_upload_link}), function(http){
        var img = new Image();
        img.src = http.responseText;
        document.getElementsByTagName('iframe')[0].contentDocument.getElementById('tinymce').append(img);
        img.click();
        if (document.querySelector('.tox-button.tox-button--secondary')) document.querySelector('.tox-button.tox-button--secondary').click();
    }, function(http){
        clearImagePreview('Произошла ошибка при загрузке! Попробуйте ещё раз...')
    })
}
function clearImagePreview(text){
    if (!text) text = 'Выберите или бросьте сюда изображение...'
    image_upload_link = undefined;
    if (!document.getElementById('custom-image-upload-container')) return;
    document.getElementById('custom-image-upload-container').innerHTML = `<label class='custom-image-upload'>
${text}
<input type="file" id='custom-image-upload' accept="image/png, image/jpg, image/jpeg, image/gif">
</label>`;
    document.getElementById('custom-image-upload').onchange = function(){
        file_getter(document.getElementById('custom-image-upload').files[0])
    }
}
(function(){    
    setTimeout(() => {
        if (!document.querySelector('button[aria-label="Вставить/редактировать изображение"]')) return;
        document.querySelector('button[aria-label="Вставить/редактировать изображение"]').addEventListener('mousedown', function(){
            setTimeout(() => {
                document.querySelector('.tox-dialog-wrap__backdrop').innerHTML += `
                <div class="custon-image-upload-main-container">
                    <label class="tox-label">Изображение</label>
                    <div class="tox-form__controls-h-stack" id='custom-image-upload-container'>
                        <label class='custom-image-upload'>
                            Выберите или бросьте сюда изображение...
                            <input type="file" id='custom-image-upload' accept="image/png, image/jpg, image/jpeg, image/gif">
                        </label>
                    </div>
                </div>`
                document.getElementById('custom-image-upload').onchange = function(){
                    file_getter(document.getElementById('custom-image-upload').files[0])
                }
                document.getElementById('custom-image-upload-container').addEventListener('dragover', e => {e.preventDefault()})
                document.getElementById('custom-image-upload-container').addEventListener('drop', e => {
                    e.preventDefault();
                    file_getter(e.dataTransfer.files[0])
                })
            }, 100)
        })
        var input = document.getElementsByTagName('iframe')[0]
        if (input){
            input = input.contentDocument;
            input.addEventListener('dragover', e => {
                e.preventDefault()
                document.getElementsByTagName('iframe')[0].classList.add('drag')
            })
            document.addEventListener('dragend', e => {
                e.preventDefault()
                document.getElementsByTagName('iframe')[0].classList.remove('drag')
            })
            input.addEventListener('dragleave', function(e){
                e.preventDefault();
                document.getElementsByTagName('iframe')[0].classList.remove('drag')
            })
            input.addEventListener('drop', function(e){
                e.preventDefault();
                document.getElementsByTagName('iframe')[0].classList.remove('drag')
                var reader = new FileReader();
                reader.readAsDataURL(e.dataTransfer.files[0]);
                reader.onloadend = function(){
                    image_upload_link = reader.result;
                    sendImageToInputInReply()
                }
            })
        }
    }, 500)
}())


function initFriendsCustomBorders(){
    var friends = JSON.stringify(sessionStorage.getItem('friendList'));
    document.querySelectorAll(`a.forum-theme__item-avatar`).forEach(element => {
        if (friends.includes(element.getAttribute('href'))) element.children[0].classList.add('custom-friend')
    })
}

function anime2ruDateTimer(){
    var item = ".date-time, time"
    let timestamps = document.querySelectorAll(item)
    , now = moment();
    for (let item of timestamps) {
        let time = item.dataset.time
        , unixdate = moment.unix(time)
        , diff = now.dayOfYear() - unixdate.dayOfYear()
        , diff_year = now.year() - unixdate.year();
        void 0 !== item.dataset.time && void 0 !== item.dataset.timeFormat ? item.innerText = unixdate.format(item.dataset.timeFormat) : void 0 !== item.dataset.time && void 0 === item.dataset.timeFormat && (item.innerText = 0 !== diff_year ? unixdate.format("D MMM YYYY в HH:mm") : diff < 0 || diff > 6 ? unixdate.format("D MMM YYYY") : diff < 1 ? now.unix() - time < 60 ? "Только что" : unixdate.fromNow() : diff < 2 ? unixdate.format("[Вчера в] HH:mm") : diff < 3 ? unixdate.format("[Позавчера в] HH:mm") : unixdate.calendar())
    }
    let customTimes = document.querySelectorAll(".date-time-custom, .date-time-from");
    for (let customTime of customTimes) {
        let time = customTime.dataset.time;
        customTime.innerText = void 0 !== time ? moment.unix(time).fromNow() : ""
    }
}