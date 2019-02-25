jQuery.noConflict();
jQuery(document).ready(function ($) {
    $ = jQuery;    

    /**
     * Limpa as sessions do Storage quando a página é recarregada
     */
    sessionStorage.removeItem('marker');
    sessionStorage.removeItem('oldMarker');

    /**
        * Define a var map do mapa para iniciarlizar na <div>map</div>.
        */
    var map = L.map('map', {
        minZoom: 2,
        maxZoom: 100
    });

    /**
   * Solicita a localizaçao do user
   * @param {*} location - recebe a localizacao do user e passando como ponto central do mapa.
   */
    if ("https:" == document.location.protocol) {
        function geo_success(position) {
            var latlng = new L.LatLng(position.coords.latitude, position.coords.longitude);
            map.setView(latlng, 8);
        }
        function errorCallback(error) {
            if (error) {
                var latlng = ({
                    coords: {
                        latitude: -22.6631703,
                        longitude: -45.0024568
                    }
                });
                geo_success(latlng);
            }
        };
        navigator.geolocation.watchPosition(geo_success, errorCallback);

    } else {
        var initialCoordinates = [-22.6631703, -45.0024568];
        var initialZoomLevel = 3;
        map.setView(initialCoordinates, initialZoomLevel);
    }


    /**
     * Atrasa a inicializaçao do mapa para evitar quebras no layer.
     */
    setTimeout(() => { map.invalidateSize() }, 1000);

    /**
     * Criaçao do dropbox no mapa com as cidades cadastradas.
     */
    var legend = L.control({ position: 'topright' });

    /**
     * Adiciona a droobox no mapa.
     */
    legend.onAdd = function () {
        var div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = '<select id = "marker_select"><option value = "init">Lugares</option></select>';
        return div;
    };
    legend.addTo(map);

    /**
     * Cria a box search no mapa.
     */
    var searchControl = L.esri.Geocoding.geosearch().addTo(map);

    /**
     * Estancia o plugin Geocoding para realizar as pesquisa de endereço no mapa.
     */
    var geocodeService = L.esri.Geocoding.geocodeService();

    /**
     * Cria um maker pesquisado no mapa de acordo com lat&lng, chamando a func localizar que utiliza a func geocode.
     * @param {*} e
     */
    searchControl.on('results', function (e) {
        localizar(e);
    });

    /**
     * var leaflocal.map_data é o retorno do servidor contendo os dados a serem inseridos no mapa, e inclui configuracoes dos marcadores.
     */
    var group = L.featureGroup().addTo(map).on("click", groupClick);
    $.each(leaflocal.ponto, function (index, value) {
        var newMarker = L.marker(value.latlng, {
            draggable: true
        });
        newMarker.feature = {
            conteudo: value.conteudo,
            link: value.link
        }
        newMarker.addTo(group);
        add_layer_ids(group, value);
    });

    /**
     * Limita as casas decimais das lat&lng, recebendo as mesmas pelo param obj.
     * @param {*} obj
     */
    function decimal(obj) {
        var casas = Math.pow(10, 7);
        return Math.floor(obj * casas) / casas;
    }

    /**
     * Adiciona informaçoes dos marcadaores em uma storageSession para que depois possa ser utilizado para relizar as açoes de editar e exluir, os dados são recebidos por "e" e a "action" define as opçoes
     * @param {*} e
     * @param {*} action
     */
    function session(e, action) {
        // Check browser support
        if (typeof (Storage) !== "undefined") {

            if (action == 'dragstart' || action == 'dragend') {
                var obj = e.target;
                Object.assign(obj._latlng, { lat: decimal(obj._latlng.lat), lng: decimal(obj._latlng.lng) })

            } else if (action == 'click') {
                var obj = e.layer;
                Object.assign(obj._latlng, { lat: decimal(obj._latlng.lat), lng: decimal(obj._latlng.lng) })
            }
            else if (action == 'select') {
                var obj = e;
                Object.assign(e._latlng, { lat: decimal(e._latlng.lat), lng: decimal(e._latlng.lng) })
            }

            //function para evitar TypeError: cyclic object value
            seen = []
            json = JSON.stringify(obj, function (key, val) {
                if (typeof val == "object") {
                    if (seen.indexOf(val) >= 0)
                        return
                    seen.push(val)
                }
                return val
            })
            // Store
            if (action == 'click') {
                sessionStorage.setItem("oldMarker", json);
                sessionStorage.setItem("marker", json);
            } else if (action == 'dragstart') {
                sessionStorage.setItem("oldMarker", json);
            } else if (action == 'dragend') {
                sessionStorage.setItem("marker", json);
            } else if (action == 'select') {
                sessionStorage.setItem("oldMarker", json);
                sessionStorage.setItem("marker", json);
            }

        } else {
            console.log("Desculpa, seu browser não suporta sessionStorage...");
        }
    }

    /**
     * Btn no popup que realiza o save na ediçao dos dados.
     */
    $("#edit-button").live('click', function (e) {
        var inputCont = L.DomUtil.get('conteudo').value;
        var inputLink = L.DomUtil.get('link').value;

        var session = JSON.parse(sessionStorage.getItem("marker"))
        var oldSession = JSON.parse(sessionStorage.getItem("oldMarker"))
        var newSession = Object.assign(session, { latlng: oldSession._latlng });
        Object.assign(newSession.feature, { conteudo: inputCont, link: inputLink })

        if (typeof newSession !== null) {
            updt_map(newSession)
        }
        // Remove all saved data from sessionStorage
        sessionStorage.clear();
        group.closePopup();
    });

    /**
     * Btn no popup que realiza a exclusao do popup no banco e no layer.
     */
    $("#delete-button").live('click', function (e) {

        var session = JSON.parse(sessionStorage.getItem("marker"))
        delete_map(session)
        // Remove all saved data from sessionStorage
        sessionStorage.clear();
        group.closePopup();
        group.removeLayer(session._leaflet_id);
    });

    /**
     * Envia os dados para a func session para realizar o save no storage ao terminar de arrastar o marker
     * @param {*} layer
     */
    function dragend(layer) {
        layer.on('dragend', function (e) {
            group.closePopup();
            openPopupOnDrag(e);
            session(e, 'dragend');
        });
    }
    /**
     * Envia os dados para a func session para realizar o save no storage quando iniciar o movimento de arrastar do marker
     * @param {*} layer
     */
    function dragstart(layer) {
        layer.on('dragstart', function (e) {
            group.closePopup();
            openPopupOnDrag(e);
            session(e, 'dragstart');
        });
    }

    /**
     * Ativa as funcs Drgend e Dragstart
     */
    group.eachLayer(dragend);
    group.eachLayer(dragstart);



    /**
     * Cria o popup com as informacoes do local do marker e envia elas para a session
     * @param {*} e
     */
    function groupClick(e) {
        session(e, 'click');
        geocode(e.latlng, e.layer.layerID, e.layer.feature.conteudo, e.layer.feature.link, 'click');
    }

    /**
     * Cria o popup com as informacoes do local do marker e envia elas para a session
     * @param {*} e
     */
    function openPopupOnDrag(e) {
        geocode(e.target._latlng, e.target.layerID, e.target.feature.conteudo, e.target.feature.link, 'dragend');
    }

    /**
     * Realiza a pesquisa do marcador e o adiciona no mapa
     * @param {*} data
     */
    function localizar(data) {
        geocode(data.latlng, null, null, null, 'search');
    }

    /**
     * Func que realiza a busca os enderecos no plugin geocode pelas lat&lng
     * @param {*} latlng - dados vindo do marcador
     * @param {*} layerID - id definido em cada marcador.
     * @param {*} conteudo - conteudo gravado no marcador
     * @param {*} link - link gravado no marcador
     * @param {*} action -  definicao de um action para diferenciar as acoes na function
     */
    function geocode(latlng, layerID, conteudo, link, action) {
        Object.assign(latlng, { lat: decimal(latlng.lat), lng: decimal(latlng.lng) })
        var id = layerID,
            gs = geocodeService.reverse().latlng(latlng).run(function (error, result) {
                if (typeof result == 'object') {

                    if (action == 'dragend' || action == 'click') {

                        var dados = map_text(result);

                        group.bindPopup(id + '<br>' + dados +
                            '<fieldset>' +
                            '<input type="text" id="conteudo" placeholder="Conteudo" value="' + conteudo + '" /><br>' +
                            '<input type="text" id="link" placeholder="Link" value="' + link + '" /><br>' +
                            '<button type="button" id="edit-button">Save</button>' +
                            '<button type="button" id="delete-button">Delete</button>' +
                            '</fieldset>')
                            .openPopup(latlng);
                    } else if (action == 'result') {
                        var dados = map_text(result);

                        group.bindPopup(id + ' ' + dados +
                            '<fieldset>' +
                            '<input type="text" id="conteudo" value="' + conteudo + '" /><br>' +
                            '<input type="text" id="link" value="' + link + '" />' +
                            '</fieldset>')
                            .openPopup(latlng);
                    }

                    if (action == 'search') {
                        var dados = map_text(result);
                        var marker = L.marker(
                            latlng, {
                                draggable: true
                            });
                        marker.feature = {
                            conteudo: "",
                            link: ""
                        }
                        marker.addTo(group);

                        var layerID = add_layer_ids(group);
                        group.bindPopup(layerID + '<br>' + dados +
                            '<fieldset>' +
                            '<input type="text" id="conteudo" placeholder="Conteudo" value="" /><br>' +
                            '<input type="text" id="link" placeholder="Link" value="" /><br>' +
                            '</fieldset>')
                            .openPopup(latlng);
                        add_map(marker);
                    }
                } else {
                    console.warn(error);
                    group.bindPopup(
                        '<label>Localização invalida</label>')
                        .openPopup(latlng);
                }

            });
        return gs;
    }

    /**
     * Adicionar os ids dos layers nos Pop-ups dos marcadores
     * @param {*} group
     */
    function add_layer_ids(group, value) {
        var tempID = 0, id = '';
        group.eachLayer(function (marker) {
            marker.layerID = tempID;
            tempID += 1;
            id = marker.layerID;
        });
        return id;
    }

    /**
     * Adiciona os dados recuperados do geocodeService nos Pop-ups dos marcadores
     * @param {*} result
     */
    function map_text(result) {
        var valores = [result.address];
        var dados = valores.map(function (e) {
            return 'A cidade é <b>' + e.City + '</b><br>A Região é <b>' + e.Region + '</b>';
        });
        return dados;
    }

    /**
     * Realiza a populacao de dados na dorpbox, ao selecionar um item na dorpbox ele é sinalizado no mapa abrindo um popup, é utilizado um TOKEN para realizar as pesquisas consumindo a api rest do geocode evitando o CORS
     * @param {*} group informacoes de todos os marcadores do mapa.
     */
    function select(group) {
        var marker_select = L.DomUtil.get("marker_select");

        function fillSelect(layer) {
            var url = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?langCode=pt&outSR=4326&returnIntersection=false&location=' + layer._latlng.lng + '%2C' + layer._latlng.lat + '&f=pjson&token?client_secret=3e0934d84f724ee68945043d74557161';

            $.ajax({
                async: true,
                url: url,
                dataType: 'jsonp',
                crossDomain: true,
                cache: false,
                success: function (data) {
                    var result = [data.address];
                    var end = result.map(function (obj) {
                        return obj.City;
                    });
                    var optionElement = document.createElement("option");
                    optionElement.innerHTML = end;
                    optionElement.value = L.stamp(layer);
                    marker_select.appendChild(optionElement);
                },
                timeout: 5000
            });
        }
        
        group.eachLayer(fillSelect);
        L.DomEvent.addListener(marker_select, 'click', function (e) {
            L.DomEvent.stopPropagation(e);
        });
        L.DomEvent.addListener(marker_select, 'change', changeHandler);
        function changeHandler(e) {
            if (e.target.value == "init") {
                map.closePopup();
            } else {
                var layer = group.getLayer(e.target.value);
                if (map.hasLayer(layer)) {
                    geocode(layer._latlng, layer.layerID, layer.feature.conteudo, layer.feature.link, 'dragend');
                    session(layer, 'select')
                }
            }
        }
    }
    /**
    * Starta function select.
    * @param {*} group 
    */
    select(group);

    //AJAX
    function add_map(obj) {
        var ajax = $.ajax({
            method: "POST",
            url: leaflocal.ajax_url,
            data: {
                action: "add-map",
                post_id: leaflocal.post_id,
                id: obj.layerID,
                lat: decimal(obj._latlng.lat),
                lng: decimal(obj._latlng.lng),
                cont: obj.conteudo,
                link: obj.link
            }
        }).done(function (data, textStatus, jqXHR) {
            group.eachLayer(dragend);
            group.eachLayer(dragstart);
            legend.remove(map);
            legend.addTo(map);
            select(group)
        });

    }
    function updt_map(obj) {
        var ajax = $.ajax({
            method: "POST",
            url: leaflocal.ajax_url,
            data: {
                action: "updt-map",
                post_id: leaflocal.post_id,
                id: obj.layerID,
                lat: decimal(obj._latlng.lat),
                oldLat: decimal(obj.latlng.lat),
                lng: decimal(obj._latlng.lng),
                oldLng: decimal(obj.latlng.lng),
                cont: obj.feature.conteudo,
                link: obj.feature.link
            }
        }).done(function (data, textStatus, jqXHR) {
            //reseta as layers do mapa
            group.clearLayers()
            setTimeout(() => {
                $.each(data, function (index, value) {
                    var newMarker = L.marker([value.latitude, value.longitude], {
                        draggable: true
                    });
                    newMarker.feature = {
                        conteudo: value.conteudo,
                        link: value.link
                    }
                    newMarker.addTo(group);
                    add_layer_ids(group, value);
                });
                group.eachLayer(dragend);
                group.eachLayer(dragstart);
                legend.remove(map);
                legend.addTo(map);
                select(group)
            }, 200);
        });
    }

    function delete_map(obj) {
        var ajax = $.ajax({
            method: "POST",
            url: leaflocal.ajax_url,
            data: {
                action: "delete-map",
                post_id: leaflocal.post_id,
                id: obj.layerID,
                lat: decimal(obj._latlng.lat),
                lng: decimal(obj._latlng.lng)
            }
        }).done(function (data, textStatus, jqXHR) {

            group.clearLayers()
            $.each(data, function (index, value) {
                var newMarker = L.marker([value.latitude, value.longitude], {
                    draggable: true
                });
                newMarker.feature = {
                    conteudo: value.conteudo,
                    link: value.link
                }
                newMarker.addTo(group);
                add_layer_ids(group, value);
            });
            group.eachLayer(dragend);
            group.eachLayer(dragstart);
            legend.remove(map);
            legend.addTo(map);
            select(group)
        });
    }

    /**
     * Adiciona a camada visual do mapa
     */
    L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
        attribution: '&copy; Contribuidores da <a href="https://www.cancaonova.com/">Canção Nova</a>'
    }).addTo(map);
});

