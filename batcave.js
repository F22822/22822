class BatCaveBizSource extends ComicSource {
    // 漫画源名称
    name = "BatCave.biz";
    // 漫画源唯一标识符
    key = "batcavebiz";
    // 漫画源版本
    version = "1.0.4"; // 版本递增
    // 应用要求的最低版本
    minAppVersion = "1.0.0";
    // 更新脚本的URL - 您需要将此文件托管在某处并在此处提供URL
    url = "https://raw.githubusercontent.com/F22822/22822/refs/heads/main/batcave.js"; // 您提供的URL

    // 网站基础URL
    BASE_URL = "https://batcave.biz";

    /**
     * 从 script 标签中提取 window.__DATA__ 或 window.__XFILTER__ 对象
     * @param html {string} - HTML 文本内容
     * @param variableName {string} - 要提取的变量名 (例如 "__DATA__" 或 "__XFILTER__")
     * @returns {object|null} - 解析后的 JSON 对象或 null
     */
    extractWindowScriptData(html, variableName) {
        try {
            // 正则表达式查找 "window.VARIABLE_NAME = { ... };"
            const regex = new RegExp(`window\\.${variableName}\\s*=\\s*(\{[\s\S]*?\});`, "m");
            const match = html.match(regex);
            if (match && match[1]) {
                return JSON.parse(match[1]);
            }
        } catch (e) {
            console.error(`解析 window.${variableName} 出错:`, e);
        }
        return null;
    }

    // [可选] 账号相关
    account = {
        /**
         * 使用账号密码登录
         */
        login: async (account, pwd) => {
            const loginUrl = `${this.BASE_URL}/`; 
            // 使用您提供的表单数据格式 (login_name=FFFF&login_password=A111111&login=submit)
            const formData = `login_name=${encodeURIComponent(account)}&login_password=${encodeURIComponent(pwd)}&login=submit`;
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded', 
                'Referer': `${this.BASE_URL}/`, 
                'Origin': this.BASE_URL 
            };
            let res = await Network.post(loginUrl, headers, formData);

            if (res.status === 200) {
                let cookiesHeader = res.headers['set-cookie'] || res.headers['Set-Cookie'] || "";
                if (Array.isArray(cookiesHeader)) {
                    cookiesHeader = cookiesHeader.join(';');
                }
                // 检查响应中是否设置了 DLE 引擎的登录 cookies
                if (cookiesHeader.includes('dle_user_id=') && cookiesHeader.includes('dle_password=')) {
                    const userIdMatch = cookiesHeader.match(/dle_user_id=([^;]+)/);
                    if (userIdMatch && userIdMatch[1] && userIdMatch[1] !== "0" && userIdMatch[1] !== "") {
                        return '登录成功 (cookies已设置，用户ID有效)';
                    }
                }
                // 如果cookies不明确，检查页面内容是否有登录成功的迹象
                const document = new HtmlDocument(res.body);
                if (document.select('a[href*="action=logout"]').length > 0) { 
                    document.dispose();
                    return '登录成功 (在响应中找到退出链接)';
                }
                const loginTitleElement = document.select('.login__title'); 
                if (loginTitleElement && loginTitleElement.text().includes(account)) { 
                    document.dispose();
                    return '登录成功 (在响应中找到用户名)';
                }
                document.dispose();
            }
            throw `登录失败. 状态码: ${res.status}. 响应体提示: ${res.body.substring(0, 300)}`;
        },
        /**
         * 退出登录
         */
        logout: async () => {
            const logoutUrl = `${this.BASE_URL}/index.php?action=logout`;
            await Network.get(logoutUrl);
            Network.deleteCookies(this.BASE_URL); // 清除当前域名的cookies
            return "退出登录操作已执行";
        },
        // 注册页面URL (DLE引擎通常的注册路径)
        registerWebsite: `${this.BASE_URL}/index.php?do=register` 
    };

    // 探索页面列表
    explore = [
        {
            // 探索页面的标题，用作唯一标识符
            title: "Homepage", 
            // 页面类型: multiPartPage (多个部分), multiPageComicList (分页列表), mixed (混合)
            type: "multiPartPage", 
            /**
             * 加载数据函数
             * @param page {number | null} - 页码，对于 multiPartPage 通常是1或null
             * @returns {Promise<Object[]> | Promise<Object>}
             */
            load: async (page) => { 
                let url = this.BASE_URL;
                // 主页上的"最新漫画发布"部分有分页 (来源: comix.txt)
                if (page && page > 1) {
                    url = `${this.BASE_URL}/page/${page}/`;
                }

                const res = await Network.get(url);
                if (res.status !== 200) {
                    throw `HTTP 请求错误，状态码: ${res.status}`;
                }
                const document = new HtmlDocument(res.body); // 使用正确的HTML解析器
                const sections = []; // 用于存放不同区块的漫画

                // 辅助函数，用于解析海报样式的漫画元素
                const parsePosterElement = (element, isCarouselOrHot) => {
                    let linkElement, comicUrl, titleElement, coverElement, publisherElement, yearElement;
                    
                    if (isCarouselOrHot) { // 用于轮播图和"热门新品"
                        linkElement = element; 
                        comicUrl = linkElement.attr('href');
                        titleElement = linkElement.select('p.poster__title'); 
                        coverElement = linkElement.select('div.poster__img img');
                        publisherElement = linkElement.select('ul.poster__subtitle li').first(); 
                        yearElement = linkElement.select('ul.poster__subtitle li').last(); 
                    } else { // 用于"最新发布"
                        linkElement = element.select('a.latest__img'); 
                        if (!linkElement) return null;
                        comicUrl = linkElement.attr('href');
                        titleElement = element.select('a.latest__title'); 
                        coverElement = linkElement.select('img'); 
                    }

                    if (!comicUrl) return null;
                    // 从URL中提取 "ID-SLUG" 格式的ID, 例如 "6975-invincible-2003"
                    const idMatch = comicUrl.match(/\/(\d+-[^\/]+\.html)/);
                    const id = idMatch ? idMatch[1].replace('.html', '') : null; 
                    if (!id) return null;

                    const title = titleElement ? titleElement.text().trim() : "";
                    const coverAttr = coverElement ? (isCarouselOrHot ? coverElement.attr('data-src') : coverElement.attr('src')) : "";
                    const cover = coverAttr ? (coverAttr.startsWith('http') ? coverAttr : this.BASE_URL + coverAttr) : "";
                    
                    let subTitle = "";
                    let tags = [];
                    let description = "";

                    if (isCarouselOrHot) {
                        const publisher = publisherElement ? publisherElement.text().trim() : "";
                        const year = yearElement ? yearElement.text().trim() : "";
                        subTitle = `${publisher || ''} (${year || ''})`.trim();
                        if (publisher) tags.push(publisher);
                        description = year || '';
                    } else { 
                        const publisherText = element.select('div.latest__publisher') ? element.select('div.latest__publisher').text().replace('Publisher:', '').trim() : ""; 
                        subTitle = publisherText;
                        if (publisherText) tags.push(publisherText);
                        const chapterText = element.select('p.latest__chapter a') ? element.select('p.latest__chapter a').text().trim() : ""; 
                        description = chapterText;
                    }

                    return {
                        id: id, 
                        title: title,
                        cover: cover,
                        subTitle: subTitle || null,
                        tags: tags,
                        description: description,
                    };
                };

                // 仅为第一页加载轮播图和热门区块
                if (!page || page === 1) { 
                    // 区块1: 顶部轮播 (Popular)
                    const popularCarouselSection = { title: "Popular (Carousel)", comics: [] };
                    const popularCarouselElements = document.selectAll('div#owl-carou a.poster.grid-item'); 
                    popularCarouselElements.forEach(el => {
                        const comic = parsePosterElement(el, true);
                        if (comic) popularCarouselSection.comics.push(comic);
                    });
                    if (popularCarouselSection.comics.length > 0) sections.push(popularCarouselSection);

                    // 区块2: 热门新品 (Hot New Releases)
                    const hotReleasesSection = { title: "Hot New Releases", comics: [] };
                    const hotReleasesElements = document.selectAll('section.sect--hot div.sect__content a.poster.grid-item'); 
                    hotReleasesElements.forEach(el => {
                        const comic = parsePosterElement(el, true);
                        if (comic) hotReleasesSection.comics.push(comic);
                    });
                    if (hotReleasesSection.comics.length > 0) sections.push(hotReleasesSection);
                }
                
                // 区块3: 最新漫画发布 (Newest Comic Releases) - Этот раздел имеет пагинацию
                const latestReleasesSectionTitle = (page && page > 1) ? `Newest Comic Releases (Page ${page})` : "Newest Comic Releases";
                const latestReleasesSection = { title: latestReleasesSectionTitle, comics: [] };
                const latestElements = document.selectAll('section.sect--latest ul#content-load > li.latest.grid-item'); 
                latestElements.forEach(el => {
                    const comic = parsePosterElement(el, false);
                    if (comic) latestReleasesSection.comics.push(comic);
                });
                
                if (latestReleasesSection.comics.length > 0) {
                     if (!page || page === 1) { // Если первая страница, добавляем ко всем секциям
                        sections.push(latestReleasesSection);
                     } else { // Если это пагинация (page > 1), возвращаем только эту секцию
                        document.dispose();
                        return [latestReleasesSection];
                     }
                }
                
                document.dispose();
                return sections; 
            }
        }
    ];

    // 分类
    category = {
        // 分类页标题
        title: "Catalogue", 
        // 分类区块，将在 init() 中动态填充
        parts: [], 
        // 是否启用排行榜页面
        enableRankingPage: false, 
    };

    /**
     * 初始化函数，用于从 /comix/ 页面加载和解析分类信息
     */
    async init() {
        try {
            const res = await Network.get(`${this.BASE_URL}/comix/`);
            if (res.status === 200) {
                const xfilterData = this.extractWindowScriptData(res.body, "__XFILTER__"); 
                if (xfilterData && xfilterData.filter_items) { 
                    const parts = [];
                    // 处理出版社 (p)
                    if (xfilterData.filter_items.p && xfilterData.filter_items.p.values) {
                        parts.push({
                            name: xfilterData.filter_items.p.title || "Publisher", 
                            type: "fixed",
                            categories: xfilterData.filter_items.p.values.map(v => v.value), 
                            itemType: "category",
                            categoryParams: xfilterData.filter_items.p.values.map(v => `p_${v.id}`), 
                        });
                    }
                    // 处理类型/ ژانры (g)
                    if (xfilterData.filter_items.g && xfilterData.filter_items.g.values) {
                        parts.push({
                            name: xfilterData.filter_items.g.title || "Genres", 
                            type: "fixed",
                            categories: xfilterData.filter_items.g.values.map(v => v.value), 
                            itemType: "category",
                            categoryParams: xfilterData.filter_items.g.values.map(v => `g_${v.id}`), 
                        });
                    }
                    this.category.parts = parts;
                } else {
                    this.category.parts = [{ name: "分类加载失败", type: "fixed", categories: ["无数据"], itemType: "category", categoryParams: ["error"] }];
                }
            } else {
                 this.category.parts = [{ name: "分类加载失败 (HTTP错误)", type: "fixed", categories: [`错误码: ${res.status}`], itemType: "category", categoryParams: ["error"] }];
            }
        } catch (e) {
            console.error("初始化分类失败 (/comix/):", e);
            this.category.parts = [{ name: "分类加载异常", type: "fixed", categories: ["请检查网络或脚本"], itemType: "category", categoryParams: ["error"] }];
        }
    }

    // 分类漫画加载相关
    categoryComics = {
        /**
         * 加载特定分类下的漫画列表
         * @param categoryName {string} - 分类名称 (未使用，因为 param 包含所需信息)
         * @param param {string} - 分类参数 (例如 "p_ID" 或 "g_ID")
         * @param options {string[]} - 排序等选项
         * @param page {number} - 页码
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        load: async (categoryName, param, options, page) => { 
            const [type, id] = param.split('_'); 
            let sortQueryParam = "";
            let yearQueryParam = ""; // TODO: Годы пока не реализованы как опция

            if(options && options[0]){ 
                const [sortBy, sortDir] = options[0].split('_'); 
                sortQueryParam = `?dlenewssortby=${sortBy}&dledirection=${sortDir.toUpperCase()}`;
            }
            
            const url = `${this.BASE_URL}/xfsearch/${type}/${id}/page/${page}/${sortQueryParam}`;
            
            const res = await Network.get(url);
            if (res.status !== 200) throw `HTTP 请求错误，状态码: ${res.status}`;
            const document = new HtmlDocument(res.body); 

            const comicElements = document.selectAll('#dle-content div.readed.d-flex.short');
            const comics = comicElements.map(element => {
                const titleAnchor = element.select('h2.readed__title > a');
                const coverImage = element.select('a.readed__img > img');
                let descriptionText = "";
                const infoItems = element.selectAll('ul.readed__info > li');
                if (infoItems && infoItems.length > 0 && typeof infoItems[0].text === 'function') {
                    descriptionText = infoItems[0].text().trim();
                }
                let lastIssueText = "";
                 if (infoItems && typeof infoItems.find === 'function') {
                    const lastIssueElement = infoItems.find(li => {
                        const span = li.select('span');
                        return span && typeof span.text === 'function' && span.text().includes('Last issue:');
                    });
                    if (lastIssueElement && typeof lastIssueElement.text === 'function') {
                        lastIssueText = lastIssueElement.text().replace("Last issue:", "Last:").trim();
                    }
                }
                if (lastIssueText) {
                     descriptionText += (descriptionText ? "\n" : "") + lastIssueText;
                }

                const comicUrl = titleAnchor ? titleAnchor.attr('href') : null;
                if (!comicUrl) return null;
                const idMatch = comicUrl.match(/\/(\d+-[^\/]+\.html)/);
                const comicId = idMatch ? idMatch[1].replace('.html', '') : null;
                if (!comicId) return null;

                const title = titleAnchor ? titleAnchor.text().trim() : "未知标题";
                const coverPath = coverImage ? coverImage.attr('data-src') : null;
                const cover = coverPath ? this.BASE_URL + coverPath : "";
                
                const metaItems = element.selectAll('div.readed__meta > div.readed__meta-item');
                let subTitle = ""; const tags = [];
                if (metaItems && metaItems.length > 0) {
                    const publisherElement = metaItems[0];
                    const publisherText = publisherElement && typeof publisherElement.text === 'function' ? publisherElement.text().trim() : "";
                    if(publisherText) { subTitle = publisherText; tags.push(publisherText); }
                    if (metaItems.length > 1) { 
                        const yearElement = metaItems[metaItems.length - 1];
                        const year = yearElement && typeof yearElement.text === 'function' ? yearElement.text().trim() : "";
                        if(year && !isNaN(year)) tags.push(year); 
                    }
                }
                return { id: comicId, title: title, cover: cover, subTitle: subTitle || null, description: descriptionText, tags: tags };
            }).filter(comic => comic != null);

            let maxPage = 1;
            const paginationElements = document.selectAll('div.pagination__pages a'); 
            const currentPageSpan = document.select('div.pagination__pages span');
             if (paginationElements.length > 0) {
                const pageNumbers = paginationElements.map(a => parseInt(a.text().trim())).filter(n => !isNaN(n));
                 if (currentPageSpan && !isNaN(parseInt(currentPageSpan.text().trim()))){
                    pageNumbers.push(parseInt(currentPageSpan.text().trim()));
                }
                if (pageNumbers.length > 0) maxPage = Math.max(...pageNumbers);
            } else if (currentPageSpan && currentPageSpan.text().trim() === "1" && comics.length > 0) {
                 maxPage = 1;
            } else if (comics.length === 0 && !document.select('div.pagination__pages a')) {
                maxPage = 1;
            }
            document.dispose();
            return { comics, maxPage };
        },
        // 分类页面的排序选项 (Источник 314-325 из comix.txt)
        optionList: [
            {
                options: [
                    "date_desc-日期 (最新)", 
                    "date_asc-日期 (最早)",  
                    "editdate_desc-更新日期", 
                    "rating_desc-评分",           
                    "news_read_desc-阅读量",         
                    "comm_num_desc-评论数",       
                    "title_asc-标题 (A-Z)",        
                    "title_desc-标题 (Z-A)",       
                ],
                label: "排序方式"
            }
            // TODO: Можно добавить фильтр по годам, если это необходимо в optionList.
            // "y": { "name": "y", "title": "Year of issue", "format": "range", "values": { "min": 1929, "max": 2024 } }
            // Это потребует ввода двух значений (от и до) или выбора из списка.
        ],
    };

    // 搜索相关
    search = {
        load: async (keyword, options, page) => {
            const url = `${this.BASE_URL}/search/${encodeURIComponent(keyword)}/page/${page}/`;
            const res = await Network.get(url);
            if (res.status !== 200) {
                throw `HTTP请求错误，状态码: ${res.status}`;
            }
            const document = new HtmlDocument(res.body);
            // Исправлено: убедимся, что comicElements определена до использования
            const comicElements = document.selectAll('#dle-content div.readed.d-flex.short'); 

            const comics = comicElements.map(element => {
                const titleAnchor = element.select('h2.readed__title > a');
                const coverImage = element.select('a.readed__img > img');
                
                let descriptionText = "";
                const infoItems = element.selectAll('ul.readed__info > li');
                
                if (infoItems && infoItems.length > 0 && infoItems[0] && typeof infoItems[0].text === 'function') { 
                    descriptionText = infoItems[0].text().trim();
                }

                let lastIssueText = "";
                if (infoItems && typeof infoItems.find === 'function') { 
                    const lastIssueElement = infoItems.find(li => {
                        const span = li.select('span');
                        return span && typeof span.text === 'function' && span.text().includes('Last issue:');
                    });
                    if (lastIssueElement && typeof lastIssueElement.text === 'function') {
                        lastIssueText = lastIssueElement.text().replace("Last issue:", "Last:").trim();
                    }
                }
                
                if (lastIssueText) {
                     descriptionText += (descriptionText ? "\n" : "") + lastIssueText;
                }

                const comicUrl = titleAnchor ? titleAnchor.attr('href') : null;
                if (!comicUrl) return null; 

                const idMatch = comicUrl.match(/\/(\d+-[^\/]+\.html)/);
                const id = idMatch ? idMatch[1].replace('.html', '') : null;
                if (!id) return null;

                const title = titleAnchor ? titleAnchor.text().trim() : "未知标题";
                const coverPath = coverImage ? coverImage.attr('data-src') : null;
                const cover = coverPath ? this.BASE_URL + coverPath : "";
                
                const metaItems = element.selectAll('div.readed__meta > div.readed__meta-item');
                let subTitle = ""; 
                const tags = [];
                if (metaItems && metaItems.length > 0) {
                    const publisherElement = metaItems[0]; 
                    const publisherText = publisherElement && typeof publisherElement.text === 'function' ? publisherElement.text().trim() : "";
                    if(publisherText) { 
                        subTitle = publisherText; 
                        tags.push(publisherText); 
                    }
                    if (metaItems.length > 1) { 
                        const yearElement = metaItems[metaItems.length - 1]; 
                        const year = yearElement && typeof yearElement.text === 'function' ? yearElement.text().trim() : "";
                        if(year && !isNaN(year)) tags.push(year); 
                    }
                }
                
                return {
                    id: id, 
                    title: title,
                    cover: cover,
                    subTitle: subTitle || null,
                    description: descriptionText,
                    tags: tags,
                };
            }).filter(comic => comic != null);

            let maxPage = 1;
            const paginationElements = document.selectAll('div.pagination__pages a'); 
            const currentPageSpan = document.select('div.pagination__pages span');
            if (paginationElements.length > 0) {
                const pageNumbers = paginationElements.map(a => parseInt(a.text().trim())).filter(n => !isNaN(n));
                 if (currentPageSpan && !isNaN(parseInt(currentPageSpan.text().trim()))){ pageNumbers.push(parseInt(currentPageSpan.text().trim())); }
                if (pageNumbers.length > 0) maxPage = Math.max(...pageNumbers);
            } else if (currentPageSpan && currentPageSpan.text().trim() === "1" && comics.length > 0) {
                 maxPage = 1;
            } else if (comics.length === 0 && !document.select('div.pagination__pages a')) { maxPage = 1; }
            
            document.dispose();
            return { comics: comics, maxPage: maxPage };
        },
        optionList: [], 
    };

    // 收藏夹相关
    favorites = {
        // 是否支持多收藏夹 (судя по window.favorites на странице деталей комикса - да)
        multiFolder: true, 
        // TODO: Все функции ниже требуют анализа XHR-запросов (POST/GET запросы на сервер при работе с избранным).
        // JavaScript переменная `window.favorites` (найденная в 章节详细页.txt) и `follow.toggle()` 
        // являются хорошими отправными точками для понимания того, какие запросы могут отправляться.
        /**
         * Добавить или удалить из избранного
         * @param comicId {string} - ID комикса (формат "ID-SLUG")
         * @param folderId {string} - Имя папки (например, "reading", "later")
         * @param isAdding {boolean} - true для добавления, false для удаления
         * @param favoriteId {string?} - ID элемента в избранном (если есть)
         */
        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            // ПРИМЕР (требует реальных данных XHR):
            // const action = isAdding ? 'addtofolder' : 'removefromfolder';
            // // folderId здесь - это имя папки, например 'reading'. На сервере может использоваться ID папки.
            // // window.favorites.folders.reading.id (из 章节详细页.txt) дает числовой ID папки.
            // const numericFolderId = this.favorites.loadFolders.siteFoldersDefinition[folderId]?.id || folderId;
            // const res = await Network.post(`${this.BASE_URL}/engine/ajax/favorites.php`, {}, 
            //    `fav_action=${action}&fav_id=${numericFolderId}&news_id=${comicId.split('-')[0]}&user_hash=ВАШ_USER_HASH`);
            // if (res.status === 200 && JSON.parse(res.body).success) return "ok";
            throw 'favorites.addOrDelFavorite не реализовано. Требуется анализ XHR-запросов.';
        },
        /**
         * Загрузка списка папок избранного
         * @param comicId {string?} - ID комикса, чтобы проверить, в каких папках он находится
         */
        loadFolders: async (comicId) => {
            // Структура папок взята из window.favorites на странице деталей комикса
            const siteFoldersDefinition = { 
                "reading": { "id": "1", "title": "Читаю" },
                "later": { "id": "2", "title": "Позже" },
                "readed": { "id": "3", "title": "Прочитано" },
                "delayed": { "id": "4", "title": "Отложено" },
                "dropped": { "id": "5", "title": "Брошено" },
                "disliked": { "id": "6", "title": "Не понравилось" },
                "liked": { "id": "7", "title": "Любимое" }
            };
            let folders = {};
            for (const key in siteFoldersDefinition) {
                folders[siteFoldersDefinition[key].name] = siteFoldersDefinition[key].title; 
            }
            let favoritedIn = [];
            // TODO: Нужен XHR запрос для определения, в каких папках находится конкретный comicId.
            // `window.favorites.active` (из 章节详细页.txt) показывает папку только для ТЕКУЩЕГО открытого комикса.
            // Если `comicId` передан, нужно сделать запрос, чтобы узнать его статус в папках.
            if (comicId) {
                // Пример:
                // const numericComicId = comicId.split('-')[0];
                // const favStatusRes = await Network.get(`${this.BASE_URL}/ajax/comic_favorite_status.php?news_id=${numericComicId}`);
                // const activeFolder = JSON.parse(favStatusRes.body).folder_name; // Предположим, API возвращает имя папки
                // if (activeFolder) favoritedIn.push(activeFolder);
            }
            return { folders: folders, favorited: favoritedIn };
        },
        /**
         * Добавить папку
         */
        addFolder: async (name) => {
            // TODO: Требуется анализ XHR-запросов
            throw 'favorites.addFolder не реализовано.';
        },
        /**
         * Удалить папку
         */
        deleteFolder: async (folderId) => {
            // TODO: Требуется анализ XHR-запросов
            throw 'favorites.deleteFolder не реализовано.';
        },
        /**
         * Загрузить комиксы из папки избранного
         * @param page {number} - номер страницы
         * @param folder {string} - имя/ID папки (например, "reading")
         */
        loadComics: async (page, folder) => { 
            // HTML для страницы закладок предоставлен в файле `收藏.txt` (URL: /favorites/reading)
            // Пагинация там тоже есть.
            const url = `${this.BASE_URL}/favorites/${folder}/page/${page}/`; // (Источник 107 из 收藏.txt - пример для пагинации)
            const res = await Network.get(url);
            if (res.status !== 200) throw `HTTP Error ${res.status}`;
            const document = new HtmlDocument(res.body);

            // Элементы комиксов на странице избранного (Источник 89 из 收藏.txt)
            const comicElements = document.selectAll('#dle-content a.poster.grid-item'); 
            const comics = comicElements.map(element => {
                const comicUrl = element.attr('href');
                const idMatch = comicUrl.match(/\/(\d+-[^\/]+\.html)/);
                const id = idMatch ? idMatch[1].replace('.html', '') : null;
                if (!id) return null;

                const title = element.select('h3.poster__title').text().trim(); // (Источник 99 из 收藏.txt)
                const imgElement = element.select('div.poster__img img');
                const cover = imgElement ? this.BASE_URL + imgElement.attr('src') : ""; // У них 'src', а не 'data-src'
                
                const publisher = element.select('ul.poster__subtitle li').first()?.text()?.trim(); // (Источник 100 из 收藏.txt)
                const year = element.select('ul.poster__subtitle li').last()?.text()?.replace('г.','').trim(); // (Источник 101 из 收藏.txt)
                let subTitle = "";
                if (publisher) subTitle += publisher;
                if (year) subTitle += (publisher ? ` (${year})` : year);
                
                // Описание и теги могут отсутствовать в явном виде на этой странице для каждого элемента
                return {
                    id: id,
                    title: title,
                    cover: cover,
                    subTitle: subTitle.trim() || null,
                    // tags и description могут быть недоступны здесь, или их нужно получать отдельно
                };
            }).filter(comic => comic != null);

            let maxPage = 1;
            // Пагинация на странице избранного (Источник 108 из 收藏.txt)
            const paginationElements = document.selectAll('div.pagination__pages a'); 
            const currentPageSpan = document.select('div.pagination__pages span');
             if (paginationElements.length > 0) {
                const pageNumbers = paginationElements.map(a => parseInt(a.text().trim())).filter(n => !isNaN(n));
                 if (currentPageSpan && !isNaN(parseInt(currentPageSpan.text().trim()))){
                    pageNumbers.push(parseInt(currentPageSpan.text().trim()));
                }
                if (pageNumbers.length > 0) maxPage = Math.max(...pageNumbers);
            } else if (currentPageSpan && currentPageSpan.text().trim() === "1" && comics.length > 0) {
                 maxPage = 1;
            } else if (comics.length === 0 && !document.select('div.pagination__pages a')) { 
                maxPage = 1;
            }

            document.dispose();
            return { comics, maxPage };
        },
    };

    /// Информация об отдельном комиксе
    comic = {
        /**
         * Загрузка полной информации о комиксе
         * @param id {string} - ID комикса в формате "ID-SLUG" (например, "23236-peanuts-2012")
         */
        loadInfo: async (id) => { 
            const comicPageUrl = `${this.BASE_URL}/${id}.html`; 
            const res = await Network.get(comicPageUrl);
            if (res.status !== 200) throw `HTTP Error ${res.status}. URL: ${comicPageUrl}`;
            const document = new HtmlDocument(res.body);

            const title = document.select('header.page__header h1').text().trim(); 
            const cover = this.BASE_URL + document.select('div.page__poster img').attr('src'); 
            const description = document.select('div.page__text.full-text').html().trim(); 

            const tagsData = {};
            const listItems = document.selectAll('aside.page__left ul.page__list li'); 
            listItems.forEach(li => {
                const labelElement = li.select('div');
                let valueText = "";
                const valueAnchors = li.selectAll('a');
                if (valueAnchors.length > 0) {
                    valueText = valueAnchors.map(a => a.text().trim()).join(', ');
                } else {
                     const nextSiblingNode = labelElement.nextSibling();
                     if (nextSiblingNode && nextSiblingNode.isText()){
                         valueText = nextSiblingNode.text().trim();
                     } else if (nextSiblingNode && nextSiblingNode.isElement()){ // Если следующий элемент не текст и не ссылка, берем его текст
                         valueText = nextSiblingNode.text().trim();
                     }
                }
                if (labelElement && valueText) {
                    const label = labelElement.text().trim().replace(':', '');
                    // Собираем значения в массив, если их несколько (например, авторы)
                    if (tagsData[label]) {
                        if (!Array.isArray(tagsData[label])) tagsData[label] = [tagsData[label]];
                        // Разделяем по запятой, если несколько авторов в одной строке без ссылок
                        valueText.split(',').forEach(val => tagsData[label].push(val.trim()));
                    } else {
                        tagsData[label] = valueText.split(',').map(val => val.trim());
                    }
                }
            });

            const genreElements = document.selectAll('div.page__tags a'); 
            const genreList = genreElements.map(el => el.text().trim());
            if (genreList.length > 0) tagsData["Genre"] = genreList;

            let chaptersMap = new Map();
            const scriptData = this.extractWindowScriptData(res.body, "__DATA__"); 
            let numericComicIdForEp = id.split('-')[0]; 

            if (scriptData && scriptData.chapters) { 
                numericComicIdForEp = scriptData.news_id.toString(); 
                scriptData.chapters.forEach(ch => {
                    chaptersMap.set(ch.id.toString(), ch.title);
                });
            }

            const recommend = [];
            const similarElements = document.selectAll('section.page__sect--hot .page__sect-content a.poster'); 
            similarElements.forEach(el => {
                const comicUrl = el.attr('href');
                const recIdMatch = comicUrl.match(/\/(\d+-[^\/]+\.html)/); 
                if (!recIdMatch || !recIdMatch[1]) return;
                const recFullId = recIdMatch[1].replace('.html', '');
                const recTitle = el.select('p.poster__title').text(); 
                const recCover = this.BASE_URL + el.select('div.poster__img img').attr('data-src'); 
                const recPublisher = el.select('ul.poster__subtitle li').first() ? el.select('ul.poster__subtitle li').first().text() : ""; 
                const recYear = el.select('ul.poster__subtitle li').last() ? el.select('ul.poster__subtitle li').last().text() : ""; 
                recommend.push({ id: recFullId, title: recTitle, cover: recCover, subTitle: `${recPublisher || ''} (${recYear || ''})`.trim() });
            });
            
            const finalTags = new Map();
            for(const key in tagsData){
                finalTags.set(key, Array.isArray(tagsData[key]) ? tagsData[key] : [tagsData[key]]);
            }
            document.dispose();
            return {
                title: title, cover: cover, description: description, tags: finalTags,
                chapters: chaptersMap, recommend: recommend, _numericComicId: numericComicIdForEp 
            };
        },

        /**
         * Загрузка изображений для главы
         * @param comicId {string} - ID комикса (формат "ID-SLUG" или числовой, если _numericComicId используется)
         * @param epId {string} - ID главы
         */
        loadEp: async (comicId, epId) => { 
            // numericComicId должен быть числовым. comicId из app может быть "id-slug"
            const numericComicId = comicId.includes('-') ? comicId.split('-')[0] : comicId;
            const url = `${this.BASE_URL}/reader/${numericComicId}/${epId}`; 
            const res = await Network.get(url);
            if (res.status !== 200) throw `HTTP Error ${res.status}`;

            const scriptData = this.extractWindowScriptData(res.body, "__DATA__"); 
            let images = [];
            if (scriptData && scriptData.images) { 
                images = scriptData.images.map(imgPath => {
                    if (imgPath.startsWith('http')) return imgPath;
                    return this.BASE_URL + imgPath; // Пути относительные от корня
                });
            }
            return { images: images };
        },

        /**
         * Вызывается перед загрузкой каждого изображения главы
         */
        onImageLoad: (url, comicId, epId) => {
             const numericComicId = comicId.includes('-') ? comicId.split('-')[0] : comicId;
            return { headers: { 'Referer': `${this.BASE_URL}/reader/${numericComicId}/${epId}` } };
        },
        
        /**
         * Обработка ссылок на комиксы
         */
        link: {
            domains: ['batcave.biz'], // Домены, с которых можно распознавать ссылки
            linkToId: (url) => {
                // Преобразование URL в ID комикса (формат "ID-SLUG")
                const comicMatch = url.match(/batcave\.biz\/(\d+-[^\/]+?)\.html/);
                if (comicMatch && comicMatch[1]) return comicMatch[1]; 
                // Из URL ридера мы не можем надежно получить "ID-SLUG", только числовой ID.
                // Если loadInfo требует "ID-SLUG", то такие ссылки не будут работать напрямую для info.
                return null; 
            }
        },
        /**
         * Обработка клика по тегу
         */
         onClickTag: (namespace, tag) => {
            let keyword = tag;
            // Для известных пространств имен (ключей из tags) можно попытаться сформировать более точный поиск
            // или перейти в категорию, если есть прямое соответствие.
            // Сейчас для простоты все теги ведут на поиск по тексту тега.
            return { action: 'search', keyword: tag };
        },
    };

    // Настройки источника (если нужны)
    settings = {};
    // Переводы (если нужны)
    translation = {};
}
