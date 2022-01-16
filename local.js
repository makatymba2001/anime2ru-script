// ==UserScript==
// @name         Anime2ru-script
// @namespace    https://anime2ru-script.herokuapp.com/
// @version      1.14
// @description  Скрипт для самых крупных аниме-форумов СНГ
// @author       Руна Дегенерации
// @match        https://dota2.ru/*
// @match        https://esportsgames.ru/*
// @grant        none
// @run-at       document-body
// @license      MIT
// ==/UserScript==  

window.host = "https://anime2ru-script.herokuapp.com";
window.host = "http://localhost:5000";

var script_mode;
var script_version = '1.14';
if (window.location.host === "dota2.ru") script_mode = "dota2.ru"
if (window.location.host === 'esportsgames.ru') script_mode = "esportsgames.ru";
var site_host = "https://" + script_mode;

var custom_smile_sections = [];

Math.clamp = function(min, value, max){
    return Math.max(min, Math.min(max, Number(value)))
}

String.prototype.includes = function(match){
    return this.indexOf(match) !== -1
}

window.createHttpRequest = function(method, link, body, onsuccess, onerror){
    let http = new XMLHttpRequest()
    http.open(method, link);
    http.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    http.setRequestHeader("Content-Type", "application/json");
    http.send(JSON.stringify(body))
    http.onreadystatechange = function(){
        if (http.readyState != 4) return;
        http.status == 200 ? onsuccess(http) : onerror(http);
    }
};

WebSocket.prototype.oldSend = WebSocket.prototype.send
WebSocket.prototype.send = function(){
    WebSocket.prototype.oldSend.apply(this, arguments);
    if (!this.old_onmessage){
        this.old_onmessage = this.onmessage;
        this.onmessage = function(){
            this.old_onmessage.apply(this, arguments);
            if (!this.url.includes('/socket.io/')) return;
            console.log("[anime2ru-script] Обновление уведомлений...")
            if (window.updateNotifications) window.updateNotifications();
            if (window.updatePrivate) window.updatePrivate();
        }
    }
};

// -----------------------------------------------------------------------------------------

// Зона максимальной скорости: получение данных аккаунта и загрузка стилей сразу же после появления document.body
// document-start работает слишком быстро, что даже document.documentElement не успевает появиться

['base_style', 'old_style', 'quick_reply', 'simple_main', 'sticky_header'].forEach(function(st){
    let executer = function(st){
        if (st == 'base_style' || localStorage.getItem('anime_' + st) === 'true'){
            let style_obj = document.createElement('style');
            style_obj.id = "custom-css-" + st;
            style_obj.innerHTML = sessionStorage.getItem('anime_' + st + '_css');
            document.documentElement.append(style_obj);
        }
    }
    if (!sessionStorage.getItem('anime_' + st + '_css')){
        console.warn('Стиль', st, "не обнаружен, начинаю загрузку...")
        createHttpRequest('GET', host + '/' + st, '', function(http){
            sessionStorage.setItem('anime_' + st + '_css', http.responseText);
            executer(st);
        }, function(){
            console.error('Не удалось получить стиль', st,'!')
        })
    }
    else executer(st)
})

// Обновление данных о используемых стилях
createHttpRequest('POST', host + '/styles', {token: localStorage.getItem('anime_token'), mode: script_mode}, function(http){
    if (!http.responseText) return;
    var style_data = JSON.parse(http.responseText);
    localStorage.anime_old_style = style_data.old_style;
    localStorage.anime_quick_reply = style_data.quick_reply;
    localStorage.anime_simple_main = style_data.simple_main;
    localStorage.anime_sticky_header = style_data.sticky_header;
}, function(){})

// Конец зоны максимальной скорости. Всё остальное - после DOMContentLoaded.

// -----------------------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', function(){

    // document.querySelector('.header__logo-big').src = "https://i.imgur.com/bi20GG9.png"

    //-----------------------------------------------
    // Сохранение и восстановление полей ввода в темах

    if (document.querySelector('.forum-theme__bottom-block') || document.querySelector('.forum-theme__create-thread')){
        let limit = 20;
        let path = window.location.pathname.replace(/page-[0-9]{1,}$/, '');
        let checker = function(){
            if (!--limit) return;
            let frame = document.querySelector('.forum-theme__bottom-block iframe') || document.querySelector('.forum-theme__create-thread iframe');
            if (frame) {
                window.onbeforeunload = function(){
                    sessionStorage.setItem('anime_' + path, frame.contentDocument.getElementById('tinymce').innerHTML)
                }
                if (sessionStorage.getItem('anime_' + path)){
                    frame.contentDocument.getElementById('tinymce').innerHTML = sessionStorage.getItem('anime_' + path);
                    document.querySelectorAll('.forum-theme__bottom-block label').forEach(function(e){e.style.display = 'none'});
                }
                
            }
            else setTimeout(checker, 200);
        }
        checker()
    }

    //-----------------------------------------------
    // Получение условно главного id

    var main_user_id = null;
    if (document.getElementsByClassName('header__subitem-head')[0]){
        main_user_id = Number(document.getElementsByClassName('header__subitem-head')[0].children[0].href.match(/\.([0-9]*)\//)[1]);
    };

    //-----------------------------------------------
    // Инициализация фонов пользователей

    var bg_result 
    var thread_ids = [];
    window.getThreadsBg = function(add_buttons){
        for (let thread_avatar of document.querySelectorAll('.forum-theme__item.forum-theme__block .forum-theme__item-avatar')){
            let id = Number(thread_avatar.href.match(/\.([0-9]*)\//)[1]);
            if (!thread_ids.includes(id)) thread_ids.push(id);
        }
        createHttpRequest('POST', host + '/getThreadsBg', {ids: thread_ids, id: main_user_id, mode: script_mode}, function(http){
            bg_result = JSON.parse(http.responseText);
            document.querySelectorAll('.forum-theme__item.forum-theme__block').forEach(function(element){
                let user_id = Number(element.querySelector('.forum-theme__item-avatar').href.match(/\.([0-9]*)\//)[1]);
                let buttons = element.querySelector('.forum-theme__item-dots .forum-theme__item-dots-block');
                if (main_user_id && main_user_id == user_id) element.classList.add('self');
                if (!bg_result[user_id]) return;
                if (bg_result[user_id].bg === null) element.removeAttribute('style');
                if (bg_result[user_id].bg && !bg_result[user_id].ignored) element.style = bg_result[user_id].bg;
                if (!add_buttons) return;
                if (buttons && main_user_id !== user_id) {
                    buttons.innerHTML += bg_result[user_id].ignored ? `<a href="javascript:void(0)" name="c:${user_id}" onclick="unignoreThreadBg(${user_id})">Не прятать фон</a>` : `<a href="javascript:void(0)" name="c:${user_id}" onclick="ignoreThreadBg(${user_id})">Скрыть фон</a>`
                }
            })
        })
    }

    window.getThreadsBg(true);

    var file_preview_link;
    window.updateThreadBg = function(){
        updateSettingsStatus();
        var thread_file = document.getElementById('thread-bg').files[0];
        if (!thread_file){
            createHttpRequest('POST', host + '/updateThreadBg', {
                token: localStorage.anime_token,
                data: undefined,
                link: document.getElementById('thread-link').value,
                br: 100 - document.getElementById('thread-bg-br-range').value,
                pos: Number(document.getElementById('thread-bg-pos-range').value), mode: script_mode,
                hide: Boolean(document.getElementById('thread-bg-hide').checked),
                self: Boolean(document.getElementById('thread-bg-self').checked),
            }
            , function(){
                updateSettingsStatus("Успешно!")
                document.getElementById('thread-bg').value = '';
                window.getThreadsBg();
            }, function(http){
                if (http.status === 401){ 
                    updateSettingsStatus('Не авторизован!')
                    localStorage.removeItem('anime_token');
                }
                else{
                    updateSettingsStatus('Произошла ошибка!')
                }
                document.getElementById('thread-bg').value = '';
            })
        }
        else if (!thread_file.type.includes('image')) {
            updateSettingsStatus('Это не изображение!')
            document.getElementById('thread-bg').value = '';
            return;
        }
        else{
            var reader = new FileReader();
            reader.readAsDataURL(thread_file);
            reader.onload = function(){
                createHttpRequest('POST', host + '/updateThreadBg', {
                    token: localStorage.anime_token,
                    data: reader.result,
                    link: undefined,
                    br: 100 - document.getElementById('thread-bg-br-range').value,
                    pos: Number(document.getElementById('thread-bg-pos-range').value), mode: script_mode
                }, function(){
                    updateSettingsStatus("Успешно!")
                    document.getElementById('thread-bg').value = '';
                    window.getThreadsBg();
                }, function(){
                    updateSettingsStatus('Произошла ошибка!')
                    document.getElementById('thread-bg').value = '';
                });
            }
        }
    }
    window.removeThreadBg = function(){
        createHttpRequest('POST', host + '/updateThreadBg', {
            token: localStorage.getItem('anime_token'),
            data: null,
            link: null,
            mode: script_mode,
            br: 100 - document.getElementById('thread-bg-br-range').value,
            pos: Number(document.getElementById('thread-bg-pos-range').value),
            hide: Boolean(document.getElementById('thread-bg-hide').checked),
            self: Boolean(document.getElementById('thread-bg-self').checked),
        }, function(){
            updateSettingsStatus("Успешно!")
            document.getElementById('thread-bg').value = '';
        }, function(){
            updateSettingsStatus('Произошла ошибка!')
            document.getElementById('thread-bg').value = '';
        })
    }
    window.unignoreThreadBg = function(u_id){
        createHttpRequest('POST', host + '/removeThreadBgIgnore', {
            token: localStorage.getItem('anime_token'),
            id: u_id, mode: script_mode
        }, function(http){
            document.querySelectorAll('.forum-theme__item.forum-theme__block').forEach(function(thread_msg_element){
                let thread_msg_id = Number(thread_msg_element.querySelector('.forum-theme__item-avatar').href.match(/\.([0-9]*)\//)[1]);
                let buttons = thread_msg_element.querySelector('.forum-theme__item-dots .forum-theme__item-dots-block');
                if (thread_msg_id == u_id){
                    thread_msg_element.style = bg_result[thread_msg_id].bg;
                    if (buttons){
                        thread_msg_element.querySelector('a[name="c:' + thread_msg_id + '"]').remove();
                        buttons.innerHTML += `<a href="javascript:void(0)" name="c:${thread_msg_id}" onclick="ignoreThreadBg(${thread_msg_id})">Скрыть фон</a>`
                    }
                }
            })
        }, function(http){

        })
    }
    window.ignoreThreadBg = function(u_id){
        createHttpRequest('POST', host + '/addThreadBgIgnore', {
            token: localStorage.getItem('anime_token'),
            id: u_id, mode: script_mode
        }, function(http){
            document.querySelectorAll('.forum-theme__item.forum-theme__block').forEach(function(thread_msg_element){
                let thread_msg_id = Number(thread_msg_element.querySelector('.forum-theme__item-avatar').href.match(/\.([0-9]*)\//)[1]);
                let buttons = thread_msg_element.querySelector('.forum-theme__item-dots .forum-theme__item-dots-block');
                if (thread_msg_id == u_id){
                    thread_msg_element.removeAttribute('style');
                    if (buttons){
                        thread_msg_element.querySelector('a[name="c:' + thread_msg_id + '"]').remove();
                        buttons.innerHTML += `<a href="javascript:void(0)" name="c:${thread_msg_id}" onclick="unignoreThreadBg(${thread_msg_id})">Не прятать фон</a>`
                    }
                }
            })
        }, function(http){
            
        })
    }

    //-----------------------------------------------
    // Добавление фонов после отправки сообщения и инициализация ctrl + v

    window.initPasteInEditors = function(){
        setTimeout(function(){
            document.querySelectorAll('iframe:not([src])').forEach(function(frame){
                frame.contentDocument.documentElement.querySelector('#tinymce').onpaste = function(e){
                    let file = e.clipboardData.files[0];
                    if (file && file.type.includes('image')){

                    }
                }
            })
        }, 750)
    }

    if (window.Conversation){
        var original_conversation_dom = window.Conversation.addDOMPost;
        var original_open_editor = window.Conversation.editMessageEditor;
        window.Conversation.addDOMPost = function(){
            original_conversation_dom.apply(this, arguments);
            window.getThreadsBg();
        }
        window.Conversation.editMessageEditor = function(){
            original_open_editor.apply(this, arguments);
            initPasteInEditors();
        }
    }

    if (window.Topic){
        var original_topic_dom = window.Topic.addDOMPost;
        var original_topic_editor = window.Topic.editMessageEditor;
        window.Topic.addDOMPost = function(){
            original_topic_dom.apply(this, arguments);
            window.getThreadsBg();
        }
        window.Topic.editMessageEditor = function(){
            original_topic_editor.apply(this, arguments);
            initPasteInEditors();
        }
    }

    //-----------------------------------------------
    // Создание панели настроек

    if (main_user_id){
        var settings_button = document.createElement('li');
        settings_button.classList.add('header__item');
        settings_button.innerHTML = `<a class='header__link custon-settings-icon' onclick="toggleCustomSettingsPanel()"><img src="${host}/settingsIcon"></a>`
        document.getElementsByClassName('header__list')[0].prepend(settings_button)
        var settings_panel = document.createElement('form');
        settings_panel.id = "custon-settings-panel";
        settings_panel.onsubmit = function(e){
            e.preventDefault();
        }
        settings_panel.innerHTML = `<div>
            <div class='close' onclick="toggleCustomSettingsPanel()">Закрыть</div>
            <div class='custom-settings-title'>
                <h2>Настройки</h2>
                <span id="script-version">Версия скрипта: ${script_version}</span><span id='custom-id'>Ваш id: </span>
            </div>
            <div id='custom-settings-status'></div>
            <div>
            <div id='custom-settings-paginator'>
                <div class='selected'>Авторизация</div>
                <div>Фон постов</div>
                <div>Стили</div>
                <div>Панель смайлов</div>
                <div>Discord</div>
                <div>Скоро будет больше...</div>
            </div>
            <div id='main-settings-container'>
                <div class='visible'>
                    <div class='custom-login-items'>
                        <p>Авторизуйтесь в расширении для доступа к его функционалу</p>
                        <input type='password' id='custom-password' placeholder="Пароль">
                        <input type='submit' value="Авторизоваться" onclick="authorizeAnimeUser()">
                        <p>Впервые в расширении?</p>
                        <input type='submit' value="Регистрация" onclick="openRegisterTab()">
                    </div>
                    <div class='custom-logout-items'>
                        <p>Изменить пароль от аккаунта расширения</p>
                        <input type='password' id='custom-old-password' placeholder="Старый пароль">
                        <input type='password' id='custom-new-password' placeholder="Новый пароль">
                        <input type='submit' value="Отправить" onclick="changePassword()">
                        <p></p>
                        <p>Разлогиниться в расширении</p>
                        <input type='submit' value="Выйти" onclick="logoutAnimeUser()">
                    </div>
                    <div class='custom-register-items'>
                        <p>Регистрация в расширении</p>
                        <p style='font-size: 12px'>- Регистрируясь в данном расширении, Вы даёте согласие на доступ к локальному хранилищу и хранилищу сессии, а также что от имени Вашего аккаунта будут проведены действия для подтверждения его владением, а именно: отправка и удаление оценки под постом форума.</p>
                        <p style='font-size: 12px'>- Если Вы модератор, администратор, или другое лицо, что имеет полномочия на данном сайте, лучше воздержитесь от использования даного расширения во благо безопасности сайта.</p>
                        <p>Придумайте пароль, с помощью которого Вы будете авторизовываться в расширении. <b>Очень желательно</b> чтобы он отличался от пароля аккаунта ${script_mode}.</p>
                        <input type='password' id='custom-register-password' placeholder="Придумайте пароль">
                        <input type='password' id='custom-register-password-r' placeholder="Повторите пароль">
                        <input type='submit' value="Зарегистрироваться" onclick="registerAnimeUser()">
                        <p>Уже зарегистрированы?</p>
                        <input type='submit' value="Авторизоваться" onclick="openLoginTab()">
                    </div>
                </div>
                <div>
                    <p>Изображение для заднего фона постов форума</p>
                    <input type='file' id='thread-bg' accept="image/png, image/jpg, image/jpeg, image/gif" onchange="updatePreviewLink()" class='small-bottom'>
                    <p class='small-bottom'>или...</p>
                    <input type='text' placeholder="Ссылка на изображение" id='thread-link' onchange="updatePreview()">
                    <p class='small-bottom'>Расположение фона</p>
                    <div class='row'>
                        <select id="thread-bg-pos" onchange="updatePreviewPos()">
                            <option value=1>Сверху</option>
                            <option value=2>По центру</option>
                            <option value=3>Снизу</option>
                            <option value=4>Другое</option>
                        </select>
                        <input type='range' min=0 max=100 value=50 id='thread-bg-pos-range' oninput="updatePreview()">
                    </div>
                    <p></p>
                    <p class='small-bottom'>Яркость</p>
                    <input type='range' min=0 max=100 value=10 id='thread-bg-br-range' oninput="updatePreview()">
                    <p>Предпросмотр</p>
                    <div id='thread-bg-preview' class='visible'>
                        <div class='preview-left-panel'>
                            ${document.getElementsByClassName('header__subitem-text--name')[0].innerText}
                            <img src="${document.getElementsByClassName('header__subitem-head')[0].children[0].children[0].src}}">
                        </div>
                    </div>
                    <div class='row checkbox'>
                        <input type="checkbox" id="thread-bg-self">
                        <label for="thread-bg-self">Не показывать свой фон другим пользователям</label>
                    </div>
                    <div class='row checkbox'>
                        <input type="checkbox" id="thread-bg-hide">
                        <label for="thread-bg-hide">Скрыть фоны других пользователей</label>
                    </div>
                    <div class='row'>
                        <input type='submit' value='Отправить' onclick='updateThreadBg()'><input type='submit' value='Удалить фон' onclick='removeThreadBg()'>
                    </div>
                </div>
                <div>
                    <div class='row checkbox'>
                        <input type='checkbox' ${localStorage.getItem('anime_old_style') === 'true' ? 'checked' : ''} id="custom-old-style">
                        <label for="custom-old-style">Старый дизайн <a href="https://i.imgur.com/HarSPa1.png" target="_blank">(?)</a></label>
                    </div>
                    <div class='row checkbox'>
                        <input type='checkbox' ${localStorage.getItem('anime_quick_reply') === 'true' ? 'checked' : ''} id="custom-quick-style">
                        <label for="custom-quick-style">Мобильное поле ответов <a href="https://i.imgur.com/EJi1ZgY.gif" target="_blank">(?)</a></label>
                    </div>
                    <div class='row checkbox'>
                        <input type='checkbox' ${localStorage.getItem('anime_sticky_header') === 'true' ? 'checked' : ''} id="custom-sticky-style">
                        <label for="custom-sticky-style">Мобильная шапка сайта <a href="https://i.imgur.com/uQufyrs.gif" target="_blank">(?)</a></label>
                    </div>
                    <div class='row checkbox'>
                        <input type='checkbox' ${localStorage.getItem('anime_simple_main') === 'true' ? 'checked' : ''} id="custom-simple-style">
                        <label for="custom-simple-style">Упрощённая главная страница <a href="https://i.imgur.com/Dnb8KLZ.png" target="_blank">(?)</a></label>
                    </div>
                    <input type='submit' onclick="applyStyles()" value="Применить стили">
                    <p></p>
                    <p>Принудительно обновить все стили скрипта</p>
                    <input type='submit' onclick="updateStyles()" value="Обновить стили">
                </div>
                <div>
                    <p>Создать вкладку для панели смайлов</p>
                    <p style='font-size: 12px'>Вы можете создать свою вкладку для панели смайлов, в которую можете добавлять любые смайлы нажатием ПКМ по ним в сообщении или внутри панели смайлов. Можно иметь не более 10 вкладок.</p>
                    <input type='text' placeholder="Название вкладки" id='custom-smile-section-name'>
                    <input type='text' placeholder="Ссылка на картинку, что будет иконкой" id='custom-smile-section-image'>
                    <input type='number' placeholder="Позиция по порядку (по умолчанию последняя)" min=0 max=10 id='custom-smile-section-order'>
                    <input type='submit' value="Создать вкладку" onclick="createSmileSection()">
                    <p></p>
                    <p>Удалить вкладку для панели смайлов</p>
                    <select id="custom-smile-section_delete">
                        <option value="0">Выберите вкладку</option>
                    </select>
                    <input type='submit' value="Удалить вкладку" onclick="deleteSmileSection()">
                </div>
                <div>
                    <p>Присоединяйтесь к нашему серверу Discord!</p>
                    <iframe src="https://discord.com/widget?id=874323890791395328&theme=dark" width="100%" height="375px" allowtransparency="true" frameborder="0" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"></iframe>
                </div>
            </div>
            </div>
            </div>`;
        document.body.append(settings_panel)

        window.openLoginTab = function(){
            document.getElementById('main-settings-container').children[0].querySelectorAll('div').forEach(function(tab){
                tab.classList.contains('custom-login-items') ? tab.classList.add('visible') : tab.classList.remove('visible')
            })
        };
        window.openRegisterTab = function(){
            document.getElementById('main-settings-container').children[0].querySelectorAll('div').forEach(function(tab){
                tab.classList.contains('custom-register-items') ? tab.classList.add('visible') : tab.classList.remove('visible')
            })
        };
        window.openLogoutTab = function(){
            document.getElementById('main-settings-container').children[0].querySelectorAll('div').forEach(function(tab){
                tab.classList.contains('custom-logout-items') ? tab.classList.add('visible') : tab.classList.remove('visible')
            })
        };

        for (let i = 0; i < document.getElementById('custom-settings-paginator').children.length; i++){
            document.getElementById('custom-settings-paginator').children[i].onclick = function(){
                updateSettingsStatus();
                selectCustomSettingsTab(i)
            }
        }

        createHttpRequest('POST', host + '/authorize', {token: localStorage.getItem('anime_token'), mode: script_mode}, function(http){
            var auth_data = JSON.parse(http.responseText);
            document.getElementById('custom-id').setAttribute('data-id', auth_data.id);
            document.getElementById('thread-link').value = auth_data.threads_bg;
            document.getElementById('thread-bg-br-range').value = 100 - auth_data.thread_bg_br;
            document.getElementById('thread-bg-pos-range').value = auth_data.thread_bg_position;
            document.getElementById('thread-bg-pos').value = (auth_data.thread_bg_position % 50 == 0) ? (auth_data.thread_bg_position / 50 + 1) : 4;
            document.getElementById('thread-bg-hide').checked = auth_data.thread_bg_hide;
            document.getElementById('thread-bg-self').checked = auth_data.thread_bg_self;
            custom_smile_sections = auth_data.custom_smile_sections || [];
            let delete_string = '';
            custom_smile_sections.forEach(function(section){
                delete_string += '<option value=' +section.id+ '>' + section.name + '</option>'
            })
            document.getElementById('custom-smile-section_delete').innerHTML += delete_string; 
            window.openLogoutTab();
            updatePreview();
        }, function(){
            document.getElementById('custom-id').removeAttribute('data-id');
            window.openLoginTab();
        })
    }
    window.toggleCustomSettingsPanel = function(){
        document.getElementById('custon-settings-panel').classList.toggle('visible')
    }
    window.selectCustomSettingsTab = function(i){
        var settings_pages = document.getElementById('main-settings-container').children;
        var settings_pagin =  document.getElementById('custom-settings-paginator').children;
        for (let j = 0; j < settings_pages.length; j++){
            settings_pages[j].classList.remove('visible');
            settings_pagin[j].classList.remove('selected');
            if (j == i) {
                settings_pages[i].classList.add('visible');
                settings_pagin[i].classList.add('selected');
            }
        }
    }
    function updateSettingsStatus(text){
        let elem = document.getElementById('custom-settings-status');
        elem.classList.remove('success');
        if (text == "Успешно!") elem.classList.add('success');
        elem.innerText = text || '';
    }

    //-----------------------------------------------
    // Настройка стилей

    window.applyStyles = function(){
        updateSettingsStatus();
        var old_style_value = document.getElementById('custom-old-style').checked;
        var quick_reply_value = document.getElementById('custom-quick-style').checked;
        var simple_main_value = document.getElementById('custom-simple-style').checked;
        var sticky_header_value = document.getElementById('custom-sticky-style').checked;
        localStorage.setItem('anime_old_style', old_style_value);
        localStorage.setItem('anime_quick_reply', quick_reply_value);
        localStorage.setItem('anime_simple_main', simple_main_value);
        localStorage.setItem('anime_sticky_header', sticky_header_value);
        createHttpRequest('POST', host + '/updateStyles', {
            token: localStorage.getItem('anime_token'),
            old_style: old_style_value,
            quick_reply: quick_reply_value,
            simple_main: simple_main_value,
            sticky_header: sticky_header_value, mode: script_mode
        }, function(http){
            window.location.reload();
        }, function(http){
            if (http.status === 403){
                document.getElementById('custom-id').removeAttribute('data-id');
                localStorage.removeItem('anime_token');
            }
            window.location.reload();
        })
    }

    window.updateStyles = function(){
        ['base_style', 'old_style', 'quick_reply', 'simple_main', 'sticky_header'].forEach(function(st){
            sessionStorage.removeItem('anime_' + st + '_css');
        })
        window.location.reload();
    }

    //-----------------------------------------------
    // Настройка фона

    window.updatePreviewLink = function(){
        file_preview_link = URL.createObjectURL(document.getElementById('thread-bg').files[0]);
        window.updatePreview();
    }
    window.updatePreviewPos = function(){
        var pos_select_value = document.getElementById('thread-bg-pos').value;
        if (pos_select_value > 0 && pos_select_value < 4){
            document.getElementById('thread-bg-pos-range').value = 50 * (pos_select_value - 1);
        }
        window.updatePreview();
    }
    window.updatePreview = function(){
        var pos_range_value = document.getElementById('thread-bg-pos-range').value;
        var br = 1 - (document.getElementById('thread-bg-br-range').value / 100);
        document.getElementById('thread-bg-pos').value = (pos_range_value % 50 == 0) ? (pos_range_value / 50 + 1) : 4;
        document.getElementById('thread-bg-preview').style.backgroundImage = `linear-gradient(to left, rgba(38, 39, 44, ${br}), rgba(38, 39, 44, ${br})), url(${file_preview_link || document.getElementById('thread-link').value})`;
        document.getElementById('thread-bg-preview').style.backgroundPositionY = pos_range_value + '%';
    }

    //-----------------------------------------------
    // Настройка вкладок смайлов

    window.createSmileSection = function(){
        updateSettingsStatus();
        createHttpRequest('POST', host + '/createSmileSection', {
            mode: script_mode,
            token: localStorage.getItem('anime_token'),
            name: document.getElementById('custom-smile-section-name').value,
            image: document.getElementById('custom-smile-section-image').value,
            order: document.getElementById('custom-smile-section-order').value
        }, function(http){
            document.getElementById('custom-smile-section-name').value = '';
            document.getElementById('custom-smile-section-image').value = '';
            document.getElementById('custom-smile-section-order').value = '';
            updateSettingsStatus("Успешно!");
        }, function(http){
            if (http.status === 400) updateSettingsStatus("Неверные данные!");
            if (http.status === 403) {
                updateSettingsStatus("Не авторизован!");
                document.getElementById('custom-id').removeAttribute('data-id');
                localStorage.removeItem('anime_token');
            }
        })
    }

    window.deleteSmileSection = function(){
        updateSettingsStatus();
        let delete_id = document.getElementById('custom-smile-section_delete').value;
        if (delete_id == 0) return;
        createHttpRequest('POST', host + '/deleteSmileSection', {
            mode: script_mode,
            id: delete_id,
            token: localStorage.getItem('anime_token'),
        }, function(http){
            document.getElementById('custom-smile-section_delete').querySelector('option[value="' + delete_id + '"]').remove();
            updateSettingsStatus("Успешно!");
        }, function(http){
            if (http.status === 400) updateSettingsStatus("Неверные данные!");
            if (http.status === 403) {
                updateSettingsStatus("Не авторизован!");
                document.getElementById('custom-id').removeAttribute('data-id');    
                localStorage.removeItem('anime_token');
            }
        })
    }

    //-----------------------------------------------
    // Регистрация/авторизация

    window.registerAnimeUser = function(){
        updateSettingsStatus();
        let register_password = document.getElementById('custom-register-password').value;
        if (register_password !== document.getElementById('custom-register-password-r').value){
            updateSettingsStatus('Пароли не совпадают!');
            return;
        }
        if (script_mode === "dota2.ru"){
            createHttpRequest('POST', site_host + '/forum/api/forum/setRateOnPost', {pid: 26000919, smileId: 1538}, function(http){
                if (JSON.parse(http.responseText).status == 'success'){
                    createHttpRequest('POST', host + '/registerUser', {id: main_user_id, mode: script_mode, password: register_password}, function(http){
                        updateSettingsStatus('Успешно!');
                        document.getElementById('custom-id').setAttribute('data-id', main_user_id);
                        localStorage.setItem('anime_token', JSON.parse(http.responseText).token);
                        window.openLogoutTab();
                        createHttpRequest('POST', site_host + '/forum/api/forum/unRatePost', {pid: 26000919, smileId: 1538}, function(http){}, function(http){})
                    }, function(http){
                        if (http.status === 500) updateSettingsStatus('Не удалось получить информацию для подтверждения!');
                        if (http.status === 403) updateSettingsStatus('Неверне данные аккаунта!');
                        if (http.status === 404) updateSettingsStatus('Регистрация не была выполнена: id пользователя не ваш!');
                        createHttpRequest('POST', site_host + '/forum/api/forum/unRatePost', {pid: 26000919, smileId: 1538}, function(http){}, function(http){})
                    })
                }
            }, function(http){
                updateSettingsStatus('Что-то пошло не так!');
            })
        }
        else if (script_mode === "esportsgames.ru"){
            createHttpRequest('POST', host + '/registerUser', {id: main_user_id, password: document.getElementById('custom-register-password').value ,mode: script_mode}, function(http){
                updateSettingsStatus('Успешно!');
                document.getElementById('custom-id').setAttribute('data-id', main_user_id);
                localStorage.setItem('anime_token', JSON.parse(http.responseText).token);
                window.openLogoutTab();
            }, function(http){
                if (http.status === 500) updateSettingsStatus('Не удалось получить информацию для подтверждения!');
                if (http.status === 403) updateSettingsStatus('Неверне данные аккаунта!');
                if (http.status === 404) updateSettingsStatus('Регистрация не была выполнена: id пользователя не ваш!');
            })
        }
    }
    window.authorizeAnimeUser = function(){
        updateSettingsStatus();
        var password = document.getElementById('custom-password').value;
        createHttpRequest('POST', host + '/authorize', {password: password, id: main_user_id, mode: script_mode},
        function(http){
            var auth_result = JSON.parse(http.responseText);
            if (auth_result.need_confirm){
            }
            else{
                updateSettingsStatus('Успешно!');
                document.getElementById('custom-id').setAttribute('data-id', auth_result.id);
                localStorage.setItem('anime_token', auth_result.token);
                document.getElementsByClassName('custom-login-items')[0].classList.remove('visible')
                document.getElementsByClassName('custom-logout-items')[0].classList.add('visible')
            }
        }, function(http){
            if (http.status === 404) updateSettingsStatus('Пользователь с такими данными не найден!');
            document.getElementById('custom-id').removeAttribute('data-id');
            window.openLoginTab();
        })
    }
    window.logoutAnimeUser = function(){
        updateSettingsStatus('Успешно!');
        localStorage.removeItem('anime_token');
        document.getElementById('custom-id').removeAttribute('data-id');
        window.openLoginTab();
    }
    window.changePassword = function(){
        updateSettingsStatus();
        createHttpRequest('POST', host + '/changePassword', {
            token: localStorage.getItem('anime_token'), 
            old_password: document.getElementById('custom-old-password').value,
            new_password: document.getElementById('custom-new-password').value, mode: script_mode
        }, function(http){
            updateSettingsStatus('Успешно!');
        }, function(http){
            if (http.status === 404) updateSettingsStatus('Неверные данные аккаунта!');
        })
    }

    //-----------------------------------------------
    // Фикс кнопки у мемов-гифок

    for (var btn of document.getElementsByClassName('memes__btn')){
        btn.onclick = function(e){e.stopPropagation()}
    }

    //-----------------------------------------------
    // Работа с рамками

    window.initFriendsCustomBorders = function(){
        var friends = JSON.stringify(sessionStorage.getItem('anime_friends_list'));
        document.querySelectorAll(`a.forum-theme__item-avatar`).forEach(element => {
            if (friends.includes(element.getAttribute('href'))) element.children[0].classList.add('custom-friend')
        })
    }
    window.initIgnoresCustomBorders = function(){
        var ignores = JSON.parse(sessionStorage.getItem('anime_ignore_list') || "[]");
        document.querySelectorAll(`a.forum-theme__item-avatar`).forEach(element => {
            if (ignores.includes(Number(element.href.match(/\.([0-9]*)\//)[1]))) element.children[0].classList.add('custom-ignore')
        })
    }

    //-----------------------------------------------
    // Получение списка друзей

    if (!sessionStorage.anime_friends_list){
        var follow_link = document.querySelectorAll('.header__subitem-head a')[0].href + 'followers/';
        createHttpRequest('POST', follow_link, {}, function(http){
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
                    sessionStorage.setItem('anime_friends_list', JSON.stringify(friend_users))
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
    
    //-----------------------------------------------
    // Получение списка тех кто тебя игнорирует

    var session_ignore_array = JSON.parse(sessionStorage.getItem('anime_ignore_list') || "[]");
    var checked_ignore_array = JSON.parse(sessionStorage.getItem('anime_ignore_list_check') || "[]");
    function getUsersWhoIgnore(){
        let arr = thread_ids.filter(function(uid){
            return !checked_ignore_array.includes(uid)
        });
        let counter = arr.length;
        let emitter = function(){
            if (!--counter){
                sessionStorage.setItem('anime_ignore_list_check', JSON.stringify(checked_ignore_array.concat(thread_ids.filter(function(element){return !checked_ignore_array.includes(element)}))))
                sessionStorage.setItem('anime_ignore_list', JSON.stringify(session_ignore_array))
                window.initIgnoresCustomBorders();
            }
        }
        arr.forEach(function(uid){
            createHttpRequest('POST', site_host + '/forum/api/user/makeWallPost', {uid: uid, content: "###".repeat(257), replyTo: null}, function(http){
                if (JSON.parse(http.responseText).status === 'ignoredByUser') {
                    session_ignore_array.push(uid);
                }
                emitter();
            })
        })
    }
    getUsersWhoIgnore();

    //-----------------------------------------------
    // Инициализация рамок 

    var ts = document.getElementsByClassName('forum-theme__top-block-user');
    if (ts.length) {
        ts = ts[0].getAttribute('href');
        document.querySelectorAll(`a.forum-theme__item-avatar[href="${ts.substring(7)}"]`).forEach(element => {
            element.children[0].classList.add('custom-ts')
        })
    }
    if (sessionStorage.anime_friends_list) initFriendsCustomBorders();
    if (sessionStorage.anime_ignore_list) initIgnoresCustomBorders();    

    //-----------------------------------------------
    // Панель уведомлений

    if (main_user_id){
        var custom_notification_panel = document.createElement('div');
        custom_notification_panel.classList.add('custom-notification-panel');
        custom_notification_panel.style.display = 'none';
        custom_notification_panel.innerHTML = '<p>Секундочку...</p>';
        document.querySelector(".header__link[href='/forum/notifications/']").prepend(custom_notification_panel);
        window.updateNotifications = function(){
            if (!main_user_id) return;
            createHttpRequest('POST', site_host + '/forum/api/notices/preload', {page: 1, name: 'Все уведомления'}, function(http){
                let notif_result = '<a><object><div id="mark-as-read">Отметить уведомления прочитанными</div></object></a>';
                var notif_unreaded_count = 0;
                JSON.parse(http.responseText).notices.forEach(function(note){
                    let post_link = note.post_id ? ("/forum/posts/" + note.post_id + "/") : null
                    let thread_link = note.topic_id ? ("/forum/threads/" + note.topic_id + "/") : null
                    let wall_link = note.wall_post_id ? ("/forum/wall/" + note.wall_post_id + "/") : null
                    let wall_comment_link = note.wall_comment_id ? ("/forum/wall-comment/" + note.wall_comment_id + "/") : null;
                    let news_link = note.news_id ? ("/news/" + note.news_id + "/") : null;
                    let main_link = news_link || wall_comment_link || wall_link || post_link || thread_link || note.link;
                    let smile_image = '';
                    if (note.is_readed === 0) notif_unreaded_count++;
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
                    </a>`
                });
                custom_notification_panel.innerHTML = notif_result;
                var notif_count_obj = document.querySelector(".header__link[href='/forum/notifications/'] > span");
                if (notif_count_obj) {
                    notif_unreaded_count === 0 ? notif_count_obj.remove() : notif_count_obj.innerHTML = Math.max(Number(notif_count_obj.innerHTML), notif_unreaded_count)
                }
                else if (notif_unreaded_count > 0){
                    document.querySelector(".header__link[href='/forum/notifications/']").innerHTML += '<span>' + notif_unreaded_count + '</span>';
                    notif_count_obj = document.querySelector(".header__link[href='/forum/notifications/']");
                }
                anime2ruDateTimer();
                document.querySelector(".header__link[href='/forum/notifications/']").onclick = function(e){
                    if (e.path.includes(document.getElementById('mark-as-read').parentElement)) e.preventDefault(); 
                }
                document.getElementById('mark-as-read').parentElement.onclick = function(){
                    createHttpRequest('POST', site_host + '/forum/api/notices/load', {}, function(){
                        for (let elem of custom_notification_panel.querySelectorAll('.unreaded')){
                            elem.classList.remove('unreaded')
                        }
                        if (notif_count_obj) notif_count_obj.remove();
                    }, function(){})
                }
            }, function(http){})
        }
    }

    //-----------------------------------------------
    // Панель личной переписки

    if (main_user_id){
        var custom_private_panel = document.createElement('div');
        custom_private_panel.classList.add('custom-notification-panel');
        custom_private_panel.style.display = 'none';
        custom_private_panel.innerHTML = '<p>Секундочку...</p>';
        document.querySelector(".header__link[href='/forum/conversations/']").prepend(custom_private_panel);
        window.updatePrivate = function(){
            if (!main_user_id) return;
            createHttpRequest('GET', site_host + "/forum/conversations/", {}, function(http){
                let _document = new DOMParser().parseFromString(http.responseText, 'text/html');
                let private_result = '<a><object><div id="private-mark-as-read">Отметить первые 20 сообщений прочитанными</div></object></a>';
                var private_unreaded_count = 0;
                var unreaded_private_array = [];
                _document.querySelectorAll('.forum-section__item:not(.forum-section__item--first)').forEach(function(note){
                    var note_title = note.querySelector(".forum-section__title-middled");
                    var is_unreaded = Boolean(note.querySelector(".forum-section__title-unread"));
                    if (is_unreaded) {
                        private_unreaded_count++;
                        unreaded_private_array.push(note_title.getAttribute('href'));
                    }
                    private_result += `
                    <a href='${note_title.getAttribute('href')}'>
                        <object>
                            <div class='notices-body__items-item background ${is_unreaded ? 'unreaded' : ''} ${note.classList.contains('ignored') ? 'closed' : ''}'>
                                <a href='${note.querySelector('a[title]')}' class='notices-body__items-item-avatar'>
                                    <img src='${note.querySelector('img').src}' class='avatar icon'>
                                </a>
                                <div class='notices-body__items-item-content'>
                                    <div class='description'>${note_title.innerText}<br><div style='font-size: 9px; line-height: 100%'>${note.querySelector('.forum-section__name').innerHTML}</div></div>
                                    <abbr data-time='${note.querySelector(".dateTime").getAttribute('data-time')}' class='date-time'>Сколько-то там времени назад</abbr>
                                </div>
                            </div>
                        </object>
                    </a>`
                })
                custom_private_panel.innerHTML = private_result;
                anime2ruDateTimer();
                var private_count_obj = document.querySelector(".header__link[href='/forum/conversations/'] > span");
                if (private_count_obj) {
                    private_unreaded_count === 0 ? private_count_obj.remove() : private_count_obj.innerHTML = Math.max(Number(private_count_obj.innerHTML), private_unreaded_count)
                }
                else if (private_unreaded_count > 0){
                    document.querySelector(".header__link[href='/forum/conversations/']").innerHTML += '<span>' + private_unreaded_count + '</span>';
                    private_count_obj = document.querySelector(".header__link[href='/forum/conversations/']");
                }
                document.querySelector(".header__link[href='/forum/conversations/']").onclick = function(e){
                    if (e.path.includes(document.getElementById('private-mark-as-read').parentElement)) e.preventDefault(); 
                }
                document.getElementById('private-mark-as-read').parentElement.onclick = function(){
                    let iterator = function(){
                        if (!unreaded_private_array.length) return;
                        createHttpRequest('GET', unreaded_private_array.shift(), {}, function(http){}, function(http){});
                        setTimeout(iterator, 250);
                    }
                    iterator();
                    for (let elem of custom_private_panel.querySelectorAll('.unreaded')){
                        elem.classList.remove('unreaded')
                    }
                    if (private_count_obj) private_count_obj.remove();
                }
            })
        }
    }

    //-----------------------------------------------
    // Игнор лист

    // create ignor list
    // (function(){
    //     if (!sessionStorage.ignoreList){
    //         createHttpRequest('POST', 'https://dota2.ru/forum/settings/ignorelist/', {}, function(http){
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
    //                     createHttpRequest('POST', 'https://dota2.ru/forum/settings/ignorelist/page-' + i, {}, function(http){
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

    //-----------------------------------------------
    // Выгрузка картинок

    var image_upload_link;
    window.clearImagePreview = function(text){
        image_upload_link = undefined;
        if (!document.getElementById('custom-image-upload-container')) return;
        document.getElementById('custom-image-upload-container').innerHTML = `
    <label class='custom-image-upload'>
        ${text || 'Выберите или бросьте сюда изображение...'}
        <input type="file" id='custom-image-upload' accept="image/png, image/jpg, image/jpeg, image/gif">
    </label>`;
        document.getElementById('custom-image-upload').onchange = function(){
            file_getter(document.getElementById('custom-image-upload').files[0])
        }
    }
    window.sendImageToInputInReply = function(){
        createHttpRequest('POST', host + "/uploadImage", {data: image_upload_link}, function(http){
            var img = new Image();
            img.src = http.responseText;
            // Так уж и быть воспользуюсь этой фигнёй
            tinyMCE.activeEditor.insertContent(img.outerHTML)
            if (document.querySelector('.tox-button.tox-button--secondary')) document.querySelector('.tox-button.tox-button--secondary').click();
            document.querySelectorAll('.forum-theme__bottom-block label').forEach(function(e){e.style.display = 'none'});
        }, function(){
            clearImagePreview('Произошла ошибка при загрузке! Попробуйте ещё раз...')
        })
        clearImagePreview('Изображение загружается...')
    }
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

    //-----------------------------------------------
    // Создание моей выгрузки

    window.addEventListener('mousedown', function(e){
        let e_path = e.path;
        if (e_path.find(function(element){return element.title === 'Вставить/редактировать изображение'})){
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
                </div>`;
                document.getElementById('custom-image-upload').onchange = function(){
                    file_getter(document.getElementById('custom-image-upload').files[0])
                }   
                document.getElementById('custom-image-upload-container').addEventListener('dragover', function(e){e.preventDefault()})
                document.getElementById('custom-image-upload-container').addEventListener('drop', function(e){
                    e.preventDefault();
                    file_getter(e.dataTransfer.files[0])
                })
            }, 100)
        }
    });

    // Выгрузка непосредственно в поле для ввода
    // var input = document.getElementsByTagName('iframe')[0]
    // if (input){
    //     input = input.contentDocument;
    //     input.addEventListener('dragover', e => {
    //         document.getElementsByTagName('iframe')[0].classList.add('drag')
    //     })
    //     document.addEventListener('dragend', e => {
    //         e.preventDefault();
    //         document.getElementsByTagName('iframe')[0].classList.remove('drag')
    //     })
    //     document.addEventListener('dropend', e => {
    //         e.preventDefault();
    //     })
    //     input.addEventListener('dragleave', function(e){
    //         document.getElementsByTagName('iframe')[0].classList.remove('drag')
    //     })
    //     input.addEventListener('drop', function(e){
    //         document.getElementsByTagName('iframe')[0].classList.remove('drag')
    //         var reader = new FileReader();
    //         reader.readAsDataURL(e.dataTransfer.files[0]);
    //         reader.onloadend = function(){
    //             image_upload_link = reader.result;
    //             sendImageToInputInReply()
    //         }
    //     })
    // }

    //-----------------------------------------------
    // Конструктор разделов смайлов в текстовых редакторах

    var smile_editors_count = 0;
    window.removeContextMenu = function(){
        custom_context_menu.style.top = "100%";
        custom_context_menu.style.left = "100%";
    }
    window.oncontextmenu = function(e){
        let smile_item = e.path.find(function(element){return element.classList && element.classList.contains('smiles-panel__smile-content')});
        let smile_data;
        if (smile_item) {
            smile_data = {
                title: smile_item.children[0].title,
                link: smile_item.querySelector('img').src,
                section_id: Number(smile_item.parentElement.parentElement.id.replace('smile-cat-', ''))
            }
            if (smile_data.section_id > 1000000) smile_data.delete_index = Array.from(smile_item.parentElement.children).findIndex(function(elem){return elem == smile_item});
        }
        else{
            smile_item = e.path.find(function(element){return element.tagName === "IMG" && element.title});
            if (!smile_item) return;
            smile_data = {
                title: smile_item.title,
                link: smile_item.src,
                section_id: null,
                delete_index: -1
            }
        }
        e.preventDefault();
        var ctx_smile_result = '';
        custom_smile_sections.forEach(function(section){
            ctx_smile_result += `<div onclick="addSmileToCustomPanel('${smile_data.title}', '${smile_data.link}', ${section.id})">${section.name}</div>`
        })
        let delete_button = smile_data.delete_index > -1 ? `<div onclick="removeSmileFromCustomPanel(${smile_data.section_id}, ${smile_data.delete_index})">Удалить смайл с этой вкладки</div>` : '';
        if (!ctx_smile_result) ctx_smile_result = '<div onclick="toggleCustomSettingsPanel(); selectCustomSettingsTab(3)">Создать вкладку...</div>';
        custom_context_menu.classList.remove('left');
        custom_context_menu.innerHTML = `
        <div onclick="navigator.clipboard.writeText('${smile_data.link}')">Скопировать ссылку на изображение</div>
        <div>Добавить смайл во вкладку...
            <div class='context_container'>
                ${ctx_smile_result}
            </div>
        </div>
        ${delete_button}`
        if (document.documentElement.clientWidth - e.clientX < (2 * custom_context_menu.clientWidth)) custom_context_menu.classList.add('left');
        custom_context_menu.style.top = Math.min(e.clientY, document.documentElement.clientHeight - custom_context_menu.clientHeight) + 'px';
        custom_context_menu.style.left = Math.min(e.clientX, document.documentElement.clientWidth - custom_context_menu.clientWidth) + 'px';
    }
    window.addEventListener('scroll', window.removeContextMenu);
    window.addEventListener('resize', window.removeContextMenu);
    window.addEventListener('click', window.removeContextMenu);


    window.addSmileSection = function(smile_panel, section_id, section_title, section_image, innerHTML, button_triggers){
        if (smile_panel.querySelector(`li[data-cat="${section_id}"]`)) return;
        var section_button = document.createElement('li');
        section_button.classList.add('smiles-panel__tabs-tab');
        section_button.innerHTML = `
        <a href="#smile-cat-${section_id}" title="${section_title}" data-cat="${section_id}" ${button_triggers || ''} style="padding: 3px 10px;">
            <img data-cat="9" src="${section_image}" style="width: 24px; vertical-align: middle;">
        </a>`;
        smile_panel.children[0].append(section_button)
        var section_content = document.createElement('div');
        section_content.classList.add("smiles-panel__tabs-content");
        section_content.id = 'smile-cat-' + section_id;
        section_content.innerHTML = innerHTML;
        smile_panel.children[1].append(section_content);
    }

    var custom_context_menu = document.createElement('div');
    custom_context_menu.id = "custom-context-menu";
    custom_context_menu.classList.add('context_container')
    document.body.append(custom_context_menu);

    // ВЗЛОМ ЖОПЫ
    var smile_replace_function = function(t,e){
        tinyMCE.activeEditor.insertContent(`<img data-smile="1" data-shortcut="${t}" src="${e}" title="${t}" height="32"/>`)
    }
    document.addEventListener('click', function(){
        if (window.tinyMCE && tinyMCE.activeEditor) tinyMCE.activeEditor.plugins.smileys.insert = smile_replace_function
    })
    window.addEventListener('mousedown', function(e){
        let e_path = e.path;
        if (e_path.find(function(element){return element.title === 'Смайлы'})){
            setTimeout(() => {
                var smile_panel = e_path.find(function(element){return element.nodeName === 'FORM' || element.classList.contains('forum-theme__item-block-mess')}).querySelector('.smiles-panel');
                if (!smile_panel.id) smile_panel.id = "smile-panel-" + smile_editors_count++;
                window.addSmileSection(smile_panel, 1000, 'BetterTTV', 'https://i.imgur.com/bmnbvsD.png',
                `<div class='bttv-search'>
                    <input type='text' oninput="bttvSearch(this)" placeholder="Поиск смайлов BTTV. Минимум 3 символа.">
                    <input type='number' oninput="bttvSearch(this)" placeholder="Смайлов на одной странице" min=1 max=100 style='width:370px'>
                    <input type='number' oninput="bttvSearch(this)" placeholder="Страница" min=1 style='width:120px'>
                </div>
                <p>Крутите колёсико вниз для дополнительных результатов</p>
                <div class='most-used-container'>
                </div>`, "onclick='bttvDefaultSearch(this)'");
                window.addSmileSection(smile_panel, 1001, 'Anime2.ru', 'https://dota2.ru/img/forum/forum-icons/6.png',
                `<div class='bttv-search'>
                    <input type='text' placeholder="Ссылка на изображение смайла" id='anime2ru-smile-link'>
                    <input type='text' placeholder="Краткое название смайла" id='anime2ru-smile-title'>
                    <div class='input' onclick="createAnime2ruSmile()">Создать смайл</div>
                </div>
                <div class='most-used-container'>
                </div>`, "onclick='getAnime2ruSmiles()'");
                custom_smile_sections.forEach(function(section){
                    window.addSmileSection(smile_panel, section.id, section.name, section.image, "<div class='most-used-container'>", 'onclick="updateSectionSmiles(' + section.id + ')"');
                })
            }, 100)
        }
    })
    var global_bttv_search_timer;
    var global_bttv_scroll = true;

    // bttv вкладка

    window.parseAndInsertBTTVSmiles = function(target, data, replace){
        var bttv_response = JSON.parse(data);
        var smile_result = '';
        bttv_response.forEach(function(smile){
            if (smile.emote) smile = smile.emote;
            smile_result += `
            <div class="smiles-panel__smile-content" style="display: inline-block; margin: 3px;">
                <a href="javascript:tinyMCE.activeEditor.plugins.smileys.insert(':${smile.code}:', 'https://cdn.betterttv.net/emote/${smile.id}/2x')"
                data-shortcut=":${smile.code}:" title=":${smile.code}:">
                    <img src='https://cdn.betterttv.net/emote/${smile.id}/2x' style="max-height: 32px; max-width: 32px;">
                </a>
            </div>`;
        })
        replace ? target.innerHTML = smile_result : target.innerHTML += smile_result;
    }
    window.bttvSearch = function(field){
        clearTimeout(global_bttv_search_timer);
        global_bttv_search_timer = setTimeout(function(){
            let childs = field.parentElement.children;
            if (childs[0].value && childs[0].value.length < 3) return;
            let count = childs[1].value ? Math.clamp(1, childs[1].value, 100) : 100;
            let offset = count * Math.max(0, childs[2].value - 1) || 0;
            let link = function(value, offset, count){
                if (value){
                    return "https://api.betterttv.net/3/emotes/shared/search?query=" + childs[0].value +"&offset="+ offset +"&limit=" + count;
                }
                else{
                    return "https://api.betterttv.net/3/emotes/shared/top?offset="+ offset +"&limit=" + count;
                }
            }
            createHttpRequest('GET', link(childs[0].value, offset, count), {}, function(http){
                let target = field.parentElement.parentElement.querySelector('.most-used-container');
                window.parseAndInsertBTTVSmiles(target, http.responseText, true)
                target.onwheel = function(e){
                    if (e.deltaY < 1) return;
                    if (!global_bttv_scroll) return;
                    global_bttv_scroll = false;
                    offset += count;
                    createHttpRequest('GET', link(childs[0].value, offset, count), {}, function(http){
                        let target = field.parentElement.parentElement.querySelector('.most-used-container');
                        window.parseAndInsertBTTVSmiles(target, http.responseText, false);
                        setTimeout(function(){
                            global_bttv_scroll = true;
                        }, 750)
                    }, function(http){})
                }
            }, function(http){})
        }, 750);
    }
    window.bttvDefaultSearch = function(link){
        let field = link.parentElement.parentElement.parentElement.querySelector('.bttv-search input');
        if (field.value) return;
        window.bttvSearch(field);
    }

    window.getAnime2ruSmiles = function(){
        createHttpRequest('GET', host + '/getAnime2ruSmiles', {}, function(http){
            let section_response = JSON.parse(http.responseText).smiles;
            var section_result = '';
            section_response.forEach(function(smile){
                section_result += `
                <div class="smiles-panel__smile-content" style="display: inline-block; margin: 3px;">
                    <a href="javascript:tinyMCE.activeEditor.plugins.smileys.insert('${smile.title}', '${smile.link}')"
                    data-shortcut="${smile.title}" title="${smile.title}">
                        <img src='${smile.link}' style="max-height: 32px; max-width: 32px;">
                    </a>
                </div>`;
            })
            document.querySelectorAll("#smile-cat-1001 .most-used-container").forEach(function(container){
                container.innerHTML = section_result;
            })
        })
    }

    // Запросы

    window.addSmileToCustomPanel = function(title, link, section_id){
        createHttpRequest('POST', host + '/addSmileToSection', {
            section_id: section_id,
            title: title,
            link: link,
            token: localStorage.getItem('anime_token'),
            mode: script_mode
        }, function(http){
            document.querySelectorAll("#smile-cat-" + section_id + " .most-used-container").forEach(function(container){
                container.innerHTML += `
                <div class="smiles-panel__smile-content" style="display: inline-block; margin: 3px;">
                    <a href="javascript:tinyMCE.activeEditor.plugins.smileys.insert('${title}', '${link}')"
                    data-shortcut="${title}" title="${title}">
                        <img src='${link}' style="max-height: 32px; max-width: 32px;">
                    </a>
                </div>`;
                })
            },
        function(http){
        })
    }
    window.removeSmileFromCustomPanel = function(section_id, index){
        createHttpRequest('POST', host + '/deleteSmileFromSection', {
            section_id: section_id,
            index: index,
            token: localStorage.getItem('anime_token'),
            mode: script_mode
        }, function(http){
            document.querySelectorAll("#smile-cat-" + section_id + " .most-used-container").forEach(function(container){
                container.children[index].remove();
            })
        }, function(http){
        })
    }
    window.updateSectionSmiles = function(section_id){
        createHttpRequest('POST', host + '/getSmilesInSection', {
            section_id: section_id,
            token: localStorage.getItem('anime_token'),
            mode: script_mode
        }, function(http){
            let section_response = JSON.parse(http.responseText).smiles;
            var section_result = '';
            section_response.forEach(function(smile){
                section_result += `
                <div class="smiles-panel__smile-content" style="display: inline-block; margin: 3px;">
                    <a href="javascript:tinyMCE.activeEditor.plugins.smileys.insert('${smile.title}', '${smile.link}')"
                    data-shortcut="${smile.title}" title="${smile.title}">
                        <img src='${smile.link}' style="max-height: 32px; max-width: 32px;">
                    </a>
                </div>`;
            })
            document.querySelectorAll("#smile-cat-" + section_id + " .most-used-container").forEach(function(container){
                container.innerHTML = section_result;
            })
        })
    }
    window.createAnime2ruSmile = function(){
        let link = document.getElementById('anime2ru-smile-link').value;
        let title = document.getElementById('anime2ru-smile-title').value;
        title = ':' + title + ':';
        if (!link || !title) return;
        createHttpRequest('POST', host + '/createAnime2ruSmile', {
            link: link,
            title: title,
            token: localStorage.getItem('anime_token'),
            mode: script_mode
        }, function(http){
            document.querySelectorAll("#smile-cat-1001 .most-used-container").forEach(function(container){
                container.innerHTML += `
                <div class="smiles-panel__smile-content" style="display: inline-block; margin: 3px;">
                    <a href="javascript:tinyMCE.activeEditor.plugins.smileys.insert('${title}', '${link}')"
                    data-shortcut="${title}" title="${title}">
                        <img src='${link}' style="max-height: 32px; max-width: 32px;">
                    </a>
                </div>`;
                })
        }, function(http){
        })
    }



    //-----------------------------------------------
    // Остальное

    function anime2ruDateTimer(){
        // Взято прямиком из сайта
        var item = ".date-time, time"
        let timestamps = document.querySelectorAll(item)
        , now = moment();
        for (let item of timestamps) {
            let time = item.dataset.time
            , unixdate = moment.unix(time)
            , diff = now.dayOfYear() - unixdate.dayOfYear()
            , diff_year = now.year() - unixdate.year();
            void 0 !== item.dataset.time && void 0 !== item.dataset.timeFormat ? 
            item.innerText = unixdate.format(item.dataset.timeFormat) : void 0 !== item.dataset.time && void 0 === item.dataset.timeFormat && 
            (item.innerText = 0 !== diff_year ? unixdate.format("D MMM YYYY в HH:mm") : diff < 0 || diff > 6 ? unixdate.format("D MMM YYYY") : diff < 1 ? now.unix() - time < 60 ? "Только что" : 
            unixdate.fromNow() : diff < 2 ? unixdate.format("[Вчера в] HH:mm") : diff < 3 ? unixdate.format("[Позавчера в] HH:mm") : unixdate.calendar())
        }
        let customTimes = document.querySelectorAll(".date-time-custom, .date-time-from");
        for (let customTime of customTimes) {
            let time = customTime.dataset.time;
            customTime.innerText = void 0 !== time ? moment.unix(time).fromNow() : ""
        }
    }
})