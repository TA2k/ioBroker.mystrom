![Logo](admin/mystrom.png)

# ioBroker.mystrom

[![NPM version](http://img.shields.io/npm/v/iobroker.mystrom.svg)](https://www.npmjs.com/package/iobroker.mystrom)
[![Downloads](https://img.shields.io/npm/dm/iobroker.mystrom.svg)](https://www.npmjs.com/package/iobroker.mystrom)
![Number of Installations (latest)](http://iobroker.live/badges/mystrom-installed.svg)
![Number of Installations (stable)](http://iobroker.live/badges/mystrom-stable.svg)
[![Dependency Status](https://img.shields.io/david/TA2k/iobroker.mystrom.svg)](https://david-dm.org/TA2k/iobroker.mystrom)
[![Known Vulnerabilities](https://snyk.io/test/github/TA2k/ioBroker.mystrom/badge.svg)](https://snyk.io/test/github/TA2k/ioBroker.mystrom)

[![NPM](https://nodei.co/npm/iobroker.mystrom.png?downloads=true)](https://nodei.co/npm/iobroker.mystrom/)

**Tests:** ![Test and Release](https://github.com/TA2k/ioBroker.mystrom/workflows/Test%20and%20Release/badge.svg)

## mystrom adapter for ioBroker

myStrom Adapter

Zum Schalten der Geräte die localCommand benutzen mystrom.0.XXXXXXX.localCommands.

Zum Schalten von ioBroker states muss man die <a href="https://github.com/ioBroker/ioBroker.simple-api">SimpleAPI</a> verwenden.

Ihr müsst die URL einmal in der App eingeben später könnt ihr sie im Adapter ändern unter: <br />mystrom.0.XXXX.cloudSettings.value.urls.cloudSingleUrl

Die SimpleAPI kann über ein ioBroker web.0 Instanz aktiviert werden. In der Instanz web.0 Optionen "Eingebautes 'Simple-API'" aktivieren.

Zum setzen eines States kann dann folgende URL
<br />

1. Unter Objekte folgenden State setzen mystrom.0.XXX.local.api/v1/device.XXXX.single (Geräte muss online sein, 8 Sekunden Button drücken)
   get://ioBrokerIP:8082/toggle/javascript.0.test
   <br />

2. In der myStrom App eingegeben werden, Button->Einstellungen->URL öffnen
   <http://ioBrokerIP:8082/toggle/javascript.0.test>
   <br />

3. Unter Objekte folgenden State setzen mystrom.0.XXXX.cloudSettings.value.urls.cloudSingleUrl
   get://ioBrokerIP:8082/toggle/javascript.0.test
   <br />

Mehr Details wie man z.B. zwei States gleichzeitig ändert:
<a href="<<<<<<<<https://api.mystrom.ch/#d74e63de-9e48-4d02-8164-cd8d7ed67332>>>>>>>>" target="_blank">https://api.mystrom.ch/#d74e63de-9e48-4d02-8164-cd8d7ed67332</a>
