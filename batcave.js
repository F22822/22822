class BatCaveBizSource extends ComicSource {
    name = "BatCave.biz";
    key = "batcavebiz";
    version = "1.0.5";
    minAppVersion = "1.0.0";
    url = "https://raw.githubusercontent.com/F22822/22822/refs/heads/main/batcave.js";

    BASE_URL = "https://batcave.biz";

    extractWindowScriptData(html, variableName) {
        try {
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
                if (loginTitleElement && typeof loginTitleElement.text === 'function' && loginTitleElement.text().includes(account)) {
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

    explore = [
        {
            title: "Homepage",
            type: "multiPartPage",
            load: async (page) => {
                let url = this.BASE_URL;
                if (page && page > 1) {
                    url = `${this.BASE_URL}/page/${page}/`;
                }
                const res = await Network.get(url);
                if (res.status !== 200) {
                    throw `HTTP error ${res.status}`;
                }
                const document = new HtmlDocument(res.body);
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

                    const title = titleElement && typeof titleElement.text === 'function' ? titleElement.text().trim() : "";
                    const coverAttr = coverElement ? (isCarouselOrHot ? coverElement.attr('data-src') : coverElement.attr('src')) : "";
                    const cover = coverAttr ? (coverAttr.startsWith('http') ? coverAttr : this.BASE_URL + coverAttr) : "";
                    
                    let subTitle = "";
                    let tags = [];
                    let description = "";

                    if (isCarouselOrHot) {
                        const publisher = publisherElement && typeof publisherElement.text === 'function' ? publisherElement.text().trim() : "";
                        const year = yearElement && typeof yearElement.text === 'function' ? yearElement.text().trim() : "";
                        subTitle = `${publisher || ''} (${year || ''})`.trim();
                        if (publisher) tags.push(publisher);
                        description = year || '';
                    } else {
                        const publisherDiv = element.select('div.latest__publisher');
                        const publisherText = publisherDiv && typeof publisherDiv.text === 'function' ? publisherDiv.text().replace('Publisher:', '').trim() : "";
                        subTitle = publisherText;
                        if (publisherText) tags.push(publisherText);
                        const chapterLink = element.select('p.latest__chapter a');
                        const chapterText = chapterLink && typeof chapterLink.text === 'function' ? chapterLink.text().trim() : "";
                        description = chapterText;
                    }
                    return { id, title, cover, subTitle: subTitle || null, tags, description };
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
                        document.dispose();
                        return [latestReleasesSection];
                     }
                }
                document.dispose();
                return sections;
            }
        }
    ];

    category = {
        title: "Catalogue",
        parts: [],
        enableRankingPage: false,
    };

    async init() {
        try {
            const res = await Network.get(`${this.BASE_URL}/comix/`);
            if (res.status === 200) {
                const document = new HtmlDocument(res.body);
                const xfilterData = this.extractWindowScriptData(res.body, "__XFILTER__");
                if (xfilterData && xfilterData.filter_items) {
                    const parts = [];
                    if (xfilterData.filter_items.p && xfilterData.filter_items.p.values) {
                        parts.push({
                            name: xfilterData.filter_items.p.title || "Publisher",
                            type: "fixed",
                            categories: xfilterData.filter_items.p.values.map(v => v.value),
                            itemType: "category",
                            categoryParams: xfilterData.filter_items.p.values.map(v => `p_${v.id}`),
                        });
                    }
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
                    this.category.parts = [{ name: "分类加载失败 (无数据)", type: "fixed", categories: ["无数据"], itemType: "category", categoryParams: ["error"] }];
                }
                document.dispose();
            } else {
                 this.category.parts = [{ name: `分类加载失败 (HTTP ${res.status})`, type: "fixed", categories: [`错误码: ${res.status}`], itemType: "category", categoryParams: ["error"] }];
            }
        } catch (e) {
            console.error("初始化分类失败 (/comix/):", e);
            this.category.parts = [{ name: "分类加载异常", type: "fixed", categories: ["请检查网络或脚本"], itemType: "category", categoryParams: ["error"] }];
        }
    }

    categoryComics = {
        load: async (categoryName, param, options, page) => {
            if (!param || !param.includes('_')) {
                throw `Неверный параметр для категории: ${param}`;
            }
            const [type, id] = param.split('_');
            let sortQueryParam = "";

            if(options && options[0]){
                const [sortBy, sortDir] = options[0].split('_');
                sortQueryParam = `?dlenewssortby=${sortBy}&dledirection=${sortDir.toUpperCase()}`;
            }
            
            const url = `${this.BASE_URL}/xfsearch/${type}/${id}/page/${page}/${sortQueryParam}`;
            
            const res = await Network.get(url);
            if (res.status !== 200) throw `HTTP Error ${res.status}`;
            const document = new HtmlDocument(res.body);

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
                return { id: comicId, title, cover, subTitle: subTitle || null, description: descriptionText, tags };
            }).filter(comic => comic != null);

            let maxPage = 1;
            const paginationElements = document.selectAll('div.pagination__pages a');
            const currentPageSpan = document.select('div.pagination__pages span');
             if (paginationElements.length > 0) {
                const pageNumbers = paginationElements.map(a => parseInt(a.text().trim())).filter(n => !isNaN(n));
                 if (currentPageSpan && typeof currentPageSpan.text === 'function' && !isNaN(parseInt(currentPageSpan.text().trim()))){
                    pageNumbers.push(parseInt(currentPageSpan.text().trim()));
                }
                if (pageNumbers.length > 0) maxPage = Math.max(...pageNumbers);
            } else if (currentPageSpan && typeof currentPageSpan.text === 'function' && currentPageSpan.text().trim() === "1" && comics.length > 0) {
                 maxPage = 1;
            } else if (comics.length === 0 && document.selectAll('div.pagination__pages a').length === 0) { // Исправлено: document.selectAll вместо document.select
                maxPage = 1;
            }
            document.dispose();
            return { comics, maxPage };
        },
        optionList: [
            {
                options: [
                    "date_desc-Date (Newest First)",
                    "date_asc-Date (Oldest First)",
                    "editdate_desc-Date of Change",
                    "rating_desc-Rating",
                    "news_read_desc-Reads",
                    "comm_num_desc-Comments",
                    "title_asc-Title (A-Z)",
                    "title_desc-Title (Z-A)",
                ],
                label: "Sort by"
            }
        ],
    };

    search = {
        load: async (keyword, options, page) => {
            const url = `${this.BASE_URL}/search/${encodeURIComponent(keyword)}/page/${page}/`;
            const res = await Network.get(url);
            if (res.status !== 200) {
                throw `HTTP error ${res.status}`;
            }
            const document = new HtmlDocument(res.body);
            const comicElements = document.selectAll('#dle-content div.readed.d-flex.short');
    
            const comics = comicElements.map(element => {
                const titleAnchor = element.select('h2.readed__title > a');
                const coverImage = element.select('a.readed__img > img');
                
                let descriptionText = "";
                const infoItems = element.selectAll('ul.readed__info > li');
                
                // Строка ~330 (бывшая), теперь сдвинута из-за комментариев и исправлений
                if (infoItems && infoItems.length > 0 && infoItems[0] && typeof infoItems[0].text === 'function') {
                    descriptionText = infoItems[0].text().trim();
                }
    
                let lastIssueText = "";
                if (infoItems && typeof infoItems.find === 'function') {
                    const lastIssueElement = infoItems.find(li => {
                        // Проверяем, что li и li.select('span') существуют перед вызовом .text()
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
    
                const comicUrl = titleAnchor && typeof titleAnchor.attr === 'function' ? titleAnchor.attr('href') : null;
                if (!comicUrl) return null;
    
                const idMatch = comicUrl.match(/\/(\d+-[^\/]+\.html)/);
                const id = idMatch ? idMatch[1].replace('.html', '') : null;
                if (!id) return null;
    
                const title = titleAnchor && typeof titleAnchor.text === 'function' ? titleAnchor.text().trim() : "Unknown Title";
                const coverPath = coverImage && typeof coverImage.attr === 'function' ? coverImage.attr('data-src') : null;
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
                 if (currentPageSpan && typeof currentPageSpan.text === 'function' && !isNaN(parseInt(currentPageSpan.text().trim()))){ pageNumbers.push(parseInt(currentPageSpan.text().trim())); }
                if (pageNumbers.length > 0) maxPage = Math.max(...pageNumbers);
            } else if (currentPageSpan && typeof currentPageSpan.text === 'function' && currentPageSpan.text().trim() === "1" && comics.length > 0) {
                 maxPage = 1;
            } else if (comics.length === 0 && document.selectAll('div.pagination__pages a').length === 0) { maxPage = 1; }
            
            document.dispose();
            return { comics: comics, maxPage: maxPage };
        },
        optionList: [],
    };

    favorites = {
        multiFolder: true,
        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            throw 'favorites.addOrDelFavorite not implemented. Requires XHR inspection.';
        },
        loadFolders: async (comicId) => {
            const siteFoldersDefinition = {
                "reading": { "id": "1", "title": "Reading" },
                "later": { "id": "2", "title": "Later" },
                "readed": { "id": "3", "title": "Finished" },
                "delayed": { "id": "4", "title": "On Hold" },
                "dropped": { "id": "5", "title": "Dropped" },
                "disliked": { "id": "6", "title": "Disliked" },
                "liked": { "id": "7", "title": "Favorites" }
            };
            let folders = {};
            for (const key in siteFoldersDefinition) {
                folders[siteFoldersDefinition[key].name] = siteFoldersDefinition[key].title;
            }
            let favoritedIn = [];
            return { folders: folders, favorited: favoritedIn };
        },
        addFolder: async (name) => {
            throw 'favorites.addFolder not implemented. Requires XHR inspection.';
        },
        deleteFolder: async (folderId) => {
            throw 'favorites.deleteFolder not implemented. Requires XHR inspection.';
        },
        loadComics: async (page, folder) => {
            const url = `${this.BASE_URL}/favorites/${folder}/page/${page}/`;
            const res = await Network.get(url);
            if (res.status !== 200) throw `HTTP Error ${res.status}`;
            const document = new HtmlDocument(res.body);

            const comicElements = document.selectAll('#dle-content a.poster.grid-item');
            const comics = comicElements.map(element => {
                const comicUrl = element.attr('href');
                const idMatch = comicUrl.match(/\/(\d+-[^\/]+\.html)/);
                const id = idMatch ? idMatch[1].replace('.html', '') : null;
                if (!id) return null;

                const titleElement = element.select('h3.poster__title');
                const title = titleElement ? titleElement.text().trim() : "Unknown Title";
                const imgElement = element.select('div.poster__img img');
                const cover = imgElement ? this.BASE_URL + imgElement.attr('src') : "";
                
                let subTitle = "";
                const publisherElement = element.select('ul.poster__subtitle li').first();
                const yearElement = element.select('ul.poster__subtitle li').last();
                const publisher = publisherElement && typeof publisherElement.text === 'function' ? publisherElement.text().trim() : "";
                const year = yearElement && typeof yearElement.text === 'function' ? yearElement.text().replace('г.','').trim() : "";
                if (publisher) subTitle += publisher;
                if (year) subTitle += (publisher ? ` (${year})` : year);
                
                return { id, title, cover, subTitle: subTitle.trim() || null };
            }).filter(comic => comic != null);

            let maxPage = 1;
            const paginationElements = document.selectAll('div.pagination__pages a');
            const currentPageSpan = document.select('div.pagination__pages span');
             if (paginationElements.length > 0) {
                const pageNumbers = paginationElements.map(a => parseInt(a.text().trim())).filter(n => !isNaN(n));
                 if (currentPageSpan && typeof currentPageSpan.text === 'function' && !isNaN(parseInt(currentPageSpan.text().trim()))){
                    pageNumbers.push(parseInt(currentPageSpan.text().trim()));
                }
                if (pageNumbers.length > 0) maxPage = Math.max(...pageNumbers);
            } else if (currentPageSpan && typeof currentPageSpan.text === 'function' && currentPageSpan.text().trim() === "1" && comics.length > 0) {
                 maxPage = 1;
            } else if (comics.length === 0 && document.selectAll('div.pagination__pages a').length === 0) {
                maxPage = 1;
            }
            document.dispose();
            return { comics, maxPage };
        },
    };

    comic = {
        loadInfo: async (id) => {
            const comicPageUrl = `${this.BASE_URL}/${id}.html`;
            const res = await Network.get(comicPageUrl);
            if (res.status !== 200) throw `HTTP Error ${res.status}. URL: ${comicPageUrl}`;
            const document = new HtmlDocument(res.body);

            const titleElement = document.select('header.page__header h1');
            const title = titleElement ? titleElement.text().trim() : "Unknown Title";

            const coverImgElement = document.select('div.page__poster img');
            const cover = coverImgElement ? this.BASE_URL + coverImgElement.attr('src') : "";
            
            const descriptionElement = document.select('div.page__text.full-text');
            const description = descriptionElement ? descriptionElement.html().trim() : "";

            const tagsData = {};
            const listItems = document.selectAll('aside.page__left ul.page__list li');
            listItems.forEach(li => {
                if (li && typeof li.select === 'function') {
                    const labelElement = li.select('div');
                    let valueText = "";
                    if (labelElement && typeof labelElement.text === 'function') {
                        const valueAnchors = li.selectAll('a');
                        if (valueAnchors && valueAnchors.length > 0) {
                            valueText = valueAnchors.map(a => typeof a.text === 'function' ? a.text().trim() : "").join(', ');
                        } else {
                            const nextSiblingNode = labelElement.nextSibling();
                            if (nextSiblingNode && typeof nextSiblingNode.isText === 'function' && nextSiblingNode.isText()){
                                valueText = nextSiblingNode.text().trim();
                            } else if (nextSiblingNode && typeof nextSiblingNode.isElement === 'function' && nextSiblingNode.isElement()){
                                valueText = nextSiblingNode.text().trim();
                            }
                        }
                        if (valueText) {
                            const label = labelElement.text().trim().replace(':', '');
                            if (tagsData[label]) {
                                if (!Array.isArray(tagsData[label])) tagsData[label] = [tagsData[label]];
                                valueText.split(',').forEach(val => { 
                                    const trimmedVal = val.trim();
                                    if(trimmedVal) tagsData[label].push(trimmedVal);
                                });
                            } else {
                                tagsData[label] = valueText.split(',').map(val => val.trim()).filter(v => v);
                            }
                            if (Array.isArray(tagsData[label]) && tagsData[label].length === 0) {
                                delete tagsData[label];
                            }
                        }
                    }
                }
            });

            const genreElements = document.selectAll('div.page__tags a');
            const genreList = genreElements.map(el => typeof el.text === 'function' ? el.text().trim() : "").filter(g => g);
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
                
                const recTitleElement = el.select('p.poster__title');
                const recTitle = recTitleElement ? recTitleElement.text() : "Unknown";

                const recCoverImg = el.select('div.poster__img img');
                const recCover = recCoverImg ? this.BASE_URL + recCoverImg.attr('data-src') : "";
                
                const recPublisherEl = el.select('ul.poster__subtitle li').first();
                const recPublisher = recPublisherEl && typeof recPublisherEl.text === 'function' ? recPublisherEl.text() : "";
                
                const recYearEl = el.select('ul.poster__subtitle li').last();
                const recYear = recYearEl && typeof recYearEl.text === 'function' ? recYearEl.text() : "";
                
                recommend.push({ id: recFullId, title: recTitle, cover: recCover, subTitle: `${recPublisher || ''} (${recYear || ''})`.trim() });
            });
            
            const finalTags = new Map();
            for(const key in tagsData){
                 if (Array.isArray(tagsData[key]) && tagsData[key].length > 0) {
                    finalTags.set(key, tagsData[key].filter(t => t));
                 } else if (!Array.isArray(tagsData[key]) && tagsData[key]){
                     finalTags.set(key, [tagsData[key]]);
                 }
            }
            document.dispose();
            return {
                title, cover, description, tags: finalTags,
                chapters: chaptersMap, recommend, _numericComicId: numericComicIdForEp
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
            return { images };
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
                return null;
            }
        },
         onClickTag: (namespace, tag) => {
            return { action: 'search', keyword: tag };
        },
    };

    settings = {};
    translation = {};
}
