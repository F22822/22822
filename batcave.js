class BatCaveBizSource extends ComicSource {
    name = "BatCave.biz";
    key = "batcavebiz";
    version = "1.0.3"; // Версия увеличена
    minAppVersion = "1.0.0";
    // update url - ЗАМЕНИТЕ НА РЕАЛЬНЫЙ URL, ГДЕ БУДЕТ РАЗМЕЩЕН ЭТОТ ФАЙЛ
    url = "https://example.com/batcavebiz_source.js"; // TODO: Замените на ваш URL

    BASE_URL = "https://batcave.biz";

    /**
     * Вспомогательная функция для извлечения window.__DATA__ или window.__XFILTER__ из тега script
     */
    extractWindowScriptData(html, variableName) {
        try {
            // Ищем переменную JavaScript в HTML
            const regex = new RegExp(`window\\.${variableName}\\s*=\\s*(\{[\s\S]*?\});`, "m");
            const match = html.match(regex);
            if (match && match[1]) {
                return JSON.parse(match[1]);
            }
        } catch (e) {
            console.error(`Error parsing window.${variableName}:`, e);
        }
        return null;
    }

    // [Optional] account related
    account = {
        login: async (account, pwd) => {
            const loginUrl = `${this.BASE_URL}/`; 
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
                if (cookiesHeader.includes('dle_user_id=') && cookiesHeader.includes('dle_password=')) {
                    const userIdMatch = cookiesHeader.match(/dle_user_id=([^;]+)/);
                    if (userIdMatch && userIdMatch[1] && userIdMatch[1] !== "0" && userIdMatch[1] !== "") {
                        return 'Login successful (cookies set with valid user ID)';
                    }
                }
                const document = new HtmlDocument(res.body);
                if (document.select('a[href*="action=logout"]').length > 0) { 
                    document.dispose();
                    return 'Login successful (logout link found in response)';
                }
                const loginTitleElement = document.select('.login__title'); 
                if (loginTitleElement && loginTitleElement.text().includes(account)) { 
                    document.dispose();
                    return 'Login successful (username found in response)';
                }
                document.dispose();
            }
            throw `Login failed. Status: ${res.status}. Response hint: ${res.body.substring(0, 300)}`;
        },
        logout: async () => {
            const logoutUrl = `${this.BASE_URL}/index.php?action=logout`;
            await Network.get(logoutUrl);
            Network.deleteCookies(this.BASE_URL);
            return "Logout action performed";
        },
        registerWebsite: `${this.BASE_URL}/index.php?do=register` 
    };

    // explore page list
    explore = [
        {
            title: "Homepage", 
            type: "multiPartPage", 
            load: async (page) => { 
                let url = this.BASE_URL;
                if (page && page > 1) { // Пагинация для "Newest comic releases" (Источник 344 из comix.txt (аналогично ранее предоставленному 首页.txt))
                    url = `${this.BASE_URL}/page/${page}/`;
                }

                const res = await Network.get(url);
                if (res.status !== 200) {
                    throw `HTTP error ${res.status}`;
                }
                const document = new HtmlDocument(res.body); // ИСПРАВЛЕНО
                const sections = [];

                const parsePosterElement = (element, isCarouselOrHot) => {
                    let linkElement, comicUrl, titleElement, coverElement, publisherElement, yearElement;
                    if (isCarouselOrHot) { 
                        linkElement = element; 
                        comicUrl = linkElement.attr('href');
                        titleElement = linkElement.select('p.poster__title'); 
                        coverElement = linkElement.select('div.poster__img img');
                        publisherElement = linkElement.select('ul.poster__subtitle li').first(); 
                        yearElement = linkElement.select('ul.poster__subtitle li').last(); 
                    } else { 
                        linkElement = element.select('a.latest__img'); 
                        if (!linkElement) return null;
                        comicUrl = linkElement.attr('href');
                        titleElement = element.select('a.latest__title'); 
                        coverElement = linkElement.select('img'); 
                    }

                    if (!comicUrl) return null;
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

                if (!page || page === 1) { 
                    const popularCarouselSection = { title: "Popular (Carousel)", comics: [] };
                    const popularCarouselElements = document.selectAll('div#owl-carou a.poster.grid-item'); 
                    popularCarouselElements.forEach(el => {
                        const comic = parsePosterElement(el, true);
                        if (comic) popularCarouselSection.comics.push(comic);
                    });
                    if (popularCarouselSection.comics.length > 0) sections.push(popularCarouselSection);

                    const hotReleasesSection = { title: "Hot New Releases", comics: [] };
                    const hotReleasesElements = document.selectAll('section.sect--hot div.sect__content a.poster.grid-item'); 
                    hotReleasesElements.forEach(el => {
                        const comic = parsePosterElement(el, true);
                        if (comic) hotReleasesSection.comics.push(comic);
                    });
                    if (hotReleasesSection.comics.length > 0) sections.push(hotReleasesSection);
                }
                
                const latestReleasesSectionTitle = (page && page > 1) ? `Newest Comic Releases (Page ${page})` : "Newest Comic Releases";
                const latestReleasesSection = { title: latestReleasesSectionTitle, comics: [] };
                const latestElements = document.selectAll('section.sect--latest ul#content-load > li.latest.grid-item'); 
                latestElements.forEach(el => {
                    const comic = parsePosterElement(el, false);
                    if (comic) latestReleasesSection.comics.push(comic);
                });
                
                if (latestReleasesSection.comics.length > 0) {
                     if (!page || page === 1) {
                        sections.push(latestReleasesSection);
                     } else {
                        document.dispose(); // ИСПРАВЛЕНО
                        return [latestReleasesSection];
                     }
                }
                document.dispose(); // ИСПРАВЛЕНО
                return sections; 
            }
        }
    ];

    // categories
    category = {
        title: "Catalogue", // (Источник 29 из comix.txt)
        parts: [], // Будет заполнено в init()
        enableRankingPage: false, // На странице /comix/ нет явного рейтинга, но есть сортировка
    };

    /**
     * Инициализация категорий из данных XFILTER на странице /comix/
     */
    async init() {
        try {
            const res = await Network.get(`${this.BASE_URL}/comix/`);
            if (res.status === 200) {
                const xfilterData = this.extractWindowScriptData(res.body, "__XFILTER__"); // (Источник 68 из comix.txt)
                if (xfilterData && xfilterData.filter_items) { // (Источник 69 из comix.txt)
                    const parts = [];
                    // Обработка издателей (p) (Источник 74 из comix.txt)
                    if (xfilterData.filter_items.p && xfilterData.filter_items.p.values) {
                        parts.push({
                            name: xfilterData.filter_items.p.title || "Publisher", // (Источник 75 из comix.txt)
                            type: "fixed",
                            categories: xfilterData.filter_items.p.values.map(v => v.value), // (Источник 76 из comix.txt)
                            itemType: "category",
                            // categoryParams будут вида "p_ID"
                            categoryParams: xfilterData.filter_items.p.values.map(v => `p_${v.id}`), // (Источник 77 из comix.txt)
                        });
                    }
                    // Обработка жанров (g) (Источник 231 из comix.txt)
                    if (xfilterData.filter_items.g && xfilterData.filter_items.g.values) {
                        parts.push({
                            name: xfilterData.filter_items.g.title || "Genres", // (Источник 232 из comix.txt)
                            type: "fixed",
                            categories: xfilterData.filter_items.g.values.map(v => v.value), // (Источник 233 из comix.txt)
                            itemType: "category",
                            // categoryParams будут вида "g_ID"
                            categoryParams: xfilterData.filter_items.g.values.map(v => `g_${v.id}`), // (Источник 234 из comix.txt)
                        });
                    }
                     // Обработка годов (y) - как отдельная опция, а не часть parts, т.к. это диапазон
                     // Можно добавить это в categoryComics.optionList если нужно
                    this.category.parts = parts;
                }
            }
        } catch (e) {
            console.error("Failed to init categories from /comix/:", e);
             // Устанавливаем заглушку, если инициализация не удалась
            this.category.parts = [{ name: "Genres (Error)", type: "fixed", categories: ["Failed to load"], itemType: "category", categoryParams: ["error"] }];
        }
    }


    // category comic loading related
    categoryComics = {
        load: async (categoryName, param, options, page) => { // param теперь "p_ID" или "g_ID"
            const [type, id] = param.split('_'); // type 'p' or 'g', id is the actual filter ID
            let sortParam = "";
            let yearParam = "";

            if(options && options[0]){ // Сортировка
                const [sortBy, sortDir] = options[0].split('_'); // например "date_desc"
                sortParam = `?dlenewssortby=${sortBy}&dledirection=${sortDir.toUpperCase()}`;
            }
            // TODO: Обработка опции года (options[1] если добавим) - /y/FROM-TO/

            const url = `${this.BASE_URL}/xfsearch/${type}/${id}/page/${page}/${sortParam}`;
            
            const res = await Network.get(url);
            if (res.status !== 200) throw `HTTP Error ${res.status}`;
            const document = new HtmlDocument(res.body); // ИСПРАВЛЕНО

            // Используем тот же парсер, что и для search
            const comicElements = document.selectAll('#dle-content div.readed.d-flex.short');
            const comics = comicElements.map(element => {
                const titleAnchor = element.select('h2.readed__title > a');
                const coverImage = element.select('a.readed__img > img');
                let descriptionText = "";
                const infoItems = element.selectAll('ul.readed__info > li');
                if (infoItems.length > 0) descriptionText = infoItems.first().text().trim();
                const lastIssueElement = infoItems.find(li => li.select('span')?.text()?.includes('Last issue:'));
                if (lastIssueElement) descriptionText += (descriptionText ? "\n" : "") + lastIssueElement.text().replace("Last issue:", "Last:").trim();

                const comicUrl = titleAnchor.attr('href');
                const idMatch = comicUrl.match(/\/(\d+-[^\/]+\.html)/);
                const comicId = idMatch ? idMatch[1].replace('.html', '') : null;
                if (!comicId) return null;

                const title = titleAnchor.text().trim();
                const cover = this.BASE_URL + coverImage.attr('data-src');
                const metaItems = element.selectAll('div.readed__meta > div.readed__meta-item');
                let subTitle = ""; const tags = [];
                if (metaItems.length > 0) {
                    const publisherText = metaItems.first().text().trim();
                    if(publisherText) { subTitle = publisherText; tags.push(publisherText); }
                    if (metaItems.length > 1) { const year = metaItems.last().text().trim(); if(year && !isNaN(year)) tags.push(year); }
                }
                return { id: comicId, title: title, cover: cover, subTitle: subTitle || null, description: descriptionText, tags: tags };
            }).filter(comic => comic != null);

            let maxPage = 1;
            const paginationElements = document.selectAll('div.pagination__pages a'); // (Источник 330 из comix.txt)
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
            document.dispose(); // ИСПРАВЛЕНО
            return { comics, maxPage };
        },
        // Опции сортировки (Источник 314-325 из comix.txt)
        optionList: [
            {
                options: [
                    "date_desc-Date (Newest First)", // dle_change_sort('date','desc') - DESC по умолчанию
                    "date_asc-Date (Oldest First)",   // dle_change_sort('date','asc')
                    "editdate_desc-Date of Change",  // dle_change_sort('editdate','desc')
                    "rating_desc-Rating",            // dle_change_sort('rating','desc')
                    "news_read_desc-Reads",          // dle_change_sort('news_read','desc')
                    "comm_num_desc-Comments",        // dle_change_sort('comm_num','desc')
                    "title_asc-Title (A-Z)",         // dle_change_sort('title','asc')
                    "title_desc-Title (Z-A)",        // dle_change_sort('title','desc')
                ],
                label: "Sort by"
            }
            // TODO: Можно добавить опцию для фильтрации по годам, если это необходимо.
            // Это потребует более сложной логики для формирования URL в load.
        ],
    };

    // search related
    search = {
        load: async (keyword, options, page) => {
            const url = `${this.BASE_URL}/search/${encodeURIComponent(keyword)}/page/${page}/`;
            const res = await Network.get(url);
            if (res.status !== 200) {
                throw `HTTP error ${res.status}`;
            }
            const document = new HtmlDocument(res.body); // ИСПРАВЛЕНО
            //const comicElements = document.selectAll('#dle-content div.readed.d-flex.short'); 

// ... inside search.load ...
            const comics = comicElements.map(element => {
                const titleAnchor = element.select('h2.readed__title > a');
                const coverImage = element.select('a.readed__img > img');
                
                let descriptionText = "";
                const infoItems = element.selectAll('ul.readed__info > li'); // This should return HtmlElement[]
                
                if (infoItems && infoItems.length > 0 && typeof infoItems[0].text === 'function') { // Check if it's an array and first element has .text
                    descriptionText = infoItems[0].text().trim(); // Replaced .first() with [0]
                }

                let lastIssueText = "";
                if (infoItems && typeof infoItems.find === 'function') { // Check if .find is available
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

                // ... rest of your parsing for comicUrl, id, title, cover, metaItems, etc. ...
                // Ensure all other .select() calls are checked for null before calling .text() or .attr()

                const comicUrl = titleAnchor ? titleAnchor.attr('href') : null;
                if (!comicUrl) return null; // Essential check

                const idMatch = comicUrl.match(/\/(\d+-[^\/]+\.html)/);
                const id = idMatch ? idMatch[1].replace('.html', '') : null;
                if (!id) return null;

                const title = titleAnchor ? titleAnchor.text().trim() : "Unknown Title";
                const coverPath = coverImage ? coverImage.attr('data-src') : null;
                const cover = coverPath ? this.BASE_URL + coverPath : "";
                
                const metaItems = element.selectAll('div.readed__meta > div.readed__meta-item');
                let subTitle = ""; 
                const tags = [];
                if (metaItems && metaItems.length > 0) {
                    const publisherElement = metaItems[0]; // Use [0] instead of .first()
                    const publisherText = publisherElement && typeof publisherElement.text === 'function' ? publisherElement.text().trim() : "";
                    if(publisherText) { 
                        subTitle = publisherText; 
                        tags.push(publisherText); 
                    }
                    if (metaItems.length > 1) { 
                        const yearElement = metaItems[metaItems.length - 1]; // Use [length-1] instead of .last()
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
// ...

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
            
            document.dispose(); // ИСПРАВЛЕНО
            return { comics: comics, maxPage: maxPage };
        },
        optionList: [], 
    };

    // favorite related
    favorites = {
        multiFolder: true, 
        // TODO: Все функции ниже требуют анализа XHR-запросов.
        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            throw 'favorites.addOrDelFavorite not implemented. Requires XHR inspection.';
        },
        loadFolders: async (comicId) => {
             const siteFoldersDefinition = { 
                "reading": { "id": "1", "title": "Reading" }, // (Источник 2114 из 章节详细页.txt)
                "later": { "id": "2", "title": "Later" }, // (Источник 2117 из 章节详细页.txt)
                "readed": { "id": "3", "title": "Finished" }, // (Источник 2120 из 章节详细页.txt)
                "delayed": { "id": "4", "title": "On Hold" }, // (Источник 2123 из 章节详细页.txt)
                "dropped": { "id": "5", "title": "Dropped" }, // (Источник 2126 из 章节详细页.txt)
                "disliked": { "id": "6", "title": "Disliked" }, // (Источник 2130 из 章节详细页.txt)
                "liked": { "id": "7", "title": "Favorites" } // (Источник 2133 из 章节详细页.txt)
            };
            let folders = {};
            for (const key in siteFoldersDefinition) {
                folders[siteFoldersDefinition[key].name] = siteFoldersDefinition[key].title; 
            }
            let favoritedIn = [];
            // TODO: Нужен XHR запрос для определения, в каких папках комикс, если comicId задан.
            return { folders: folders, favorited: favoritedIn };
        },
        addFolder: async (name) => {
            throw 'favorites.addFolder not implemented. Requires XHR inspection.';
        },
        deleteFolder: async (folderId) => {
            throw 'favorites.deleteFolder not implemented. Requires XHR inspection.';
        },
        loadComics: async (page, folder) => { 
            throw 'favorites.loadComics not implemented. Requires XHR/HTML inspection of favorites pages.';
        },
    };

    /// single comic related
    comic = {
        loadInfo: async (id) => { // id здесь "ID-SLUG", например "23236-peanuts-2012"
            const comicPageUrl = `${this.BASE_URL}/${id}.html`; 
            const res = await Network.get(comicPageUrl);
            if (res.status !== 200) throw `HTTP Error ${res.status}. URL: ${comicPageUrl}`;
            const document = new HtmlDocument(res.body); // ИСПРАВЛЕНО

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
                     const nextSibling = labelElement.nextSibling();
                     if (nextSibling && nextSibling.isText()){
                         valueText = nextSibling.text().trim();
                     } else if (nextSibling && nextSibling.isElement()){
                         valueText = nextSibling.text().trim();
                     }
                }
                if (labelElement && valueText) {
                    const label = labelElement.text().trim().replace(':', '');
                    if (tagsData[label]) {
                        if (!Array.isArray(tagsData[label])) tagsData[label] = [tagsData[label]];
                        tagsData[label].push(valueText);
                    } else {
                        tagsData[label] = [valueText];
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
            document.dispose(); // ИСПРАВЛЕНО
            return {
                title: title, cover: cover, description: description, tags: finalTags,
                chapters: chaptersMap, recommend: recommend, _numericComicId: numericComicIdForEp 
            };
        },

        loadEp: async (comicId, epId) => { 
            const numericComicId = comicId.includes('-') ? comicId.split('-')[0] : comicId;
            const url = `${this.BASE_URL}/reader/${numericComicId}/${epId}`; 
            const res = await Network.get(url);
            if (res.status !== 200) throw `HTTP Error ${res.status}`;

            const scriptData = this.extractWindowScriptData(res.body, "__DATA__"); 
            let images = [];
            if (scriptData && scriptData.images) { 
                images = scriptData.images.map(imgPath => {
                    if (imgPath.startsWith('http')) return imgPath;
                    return this.BASE_URL + imgPath;
                });
            }
            return { images: images };
        },

        onImageLoad: (url, comicId, epId) => {
             const numericComicId = comicId.includes('-') ? comicId.split('-')[0] : comicId;
            return { headers: { 'Referer': `${this.BASE_URL}/reader/${numericComicId}/${epId}` } };
        },
        
        link: {
            domains: ['batcave.biz'],
            linkToId: (url) => {
                const comicMatch = url.match(/batcave\.biz\/(\d+-[^\/]+?)\.html/);
                if (comicMatch && comicMatch[1]) return comicMatch[1]; 
                // Для URL ридера возвращаем null, т.к. не можем получить полный "id-slug"
                // const readerComicMatch = url.match(/batcave\.biz\/reader\/(\d+)/);
                // if (readerComicMatch && readerComicMatch[1]) return readerComicMatch[1]; 
                return null; 
            }
        },
         onClickTag: (namespace, tag) => {
            let keyword = tag;
            if (namespace === "Genre" || namespace === "Year" || namespace === "Publisher") {
                 // Если это ссылка, извлекаем последнюю часть как параметр для категории
                 const urlParts = tag.split('/');
                 const param = urlParts.filter(part => part.length > 0).pop();
                 if (param) {
                    // Проверяем, существует ли такой param в наших categoryParams
                    // Это сложная логика, так как namespace и tag не всегда дают прямой ключ к categoryParams
                    // Для простоты, пока ищем по тексту тега
                    return { action: 'search', keyword: tag };
                 }
            }
            return { action: 'search', keyword: tag };
        },
    };

    settings = {};
    translation = {};
}