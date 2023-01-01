#!/bin/sh
. /usr/bin/softwarecenter/lib_functions.sh
cpu_model=$(uci get softwarecenter.main.cpu_model 2>/dev/null)
webui_name=$(uci get softwarecenter.main.webui_name 2>/dev/null)
webui_pass=$(uci get softwarecenter.main.webui_pass 2>/dev/null)
download_dir=$(uci get softwarecenter.main.download_dir 2>/dev/null)
pp=$(echo -n $webui_pass | md5sum | awk '{print $1}')
make_dir /opt/share/www /opt/etc/config $download_dir

install_amule() {
	local time_out="timeout 2m"
	if opkg_install amule; then
		/opt/etc/init.d/S57amuled start >/dev/null 2>&1 && sleep 5
		/opt/etc/init.d/S57amuled stop >/dev/null 2>&1
		if wget -t5 -qO /tmp/AmuleWebUI.zip github.com/MatteoRagni/AmuleWebUI-Reloaded/archive/refs/heads/master.zip; then
			unzip -q /tmp/AmuleWebUI.zip -d /tmp
			mv /tmp/AmuleWebUI-Reloaded-master /opt/share/amule/webserver/AmuleWebUI-Reloaded
			sed -i 's/ajax.googleapis.com/ajax.lug.ustc.edu.cn/g' /opt/share/amule/webserver/AmuleWebUI-Reloaded/*.php
		else
			echo_time "AmuleWebUI-Reloaded 下载失败，使用原版UI。"
		fi
		sed -i "{
			s/^Enabled=.*/Enabled=1/
			s/^ECPas.*/ECPassword=$pp/
			s/^UPnPEn.*/UPnPEnabled=1/
			s/^Password=.*/Password=$pp/
			s/^UPnPECE.*/UPnPECEnabled=1/
			s/^Template=.*/Template=AmuleWebUI-Reloaded/
			s/^AcceptExternal.*/AcceptExternalConnections=1/
			s|^IncomingDir=.*|IncomingDir=$download_dir|
		}" /opt/var/amule/amule.conf
		ln -sf /opt/var/amule/amule.conf /opt/etc/config/amule.conf
		/opt/etc/init.d/S57amuled restart >/dev/null 2>&1
		echo_time "登录WebUI的密码 $webui_pass"
		_pidof amuled

	else
		echo_time "amule 安装失败，再重试安装！"
		exit 1
	fi
}

install_aria2() {
	local time_out="timeout 1m"
	if opkg_install aria2; then
		pro="/opt/etc/aria2"
		rm -rf /opt/var/aria2
		make_dir $pro && cd $pro
		for i in core aria2.conf clean.sh delete.sh tracker.sh dht.dat dht6.dat script.conf; do
				wget -qN -t2 -T3 raw.githubusercontent.com/P3TERX/aria2.conf/master/$i || \
				wget -qN -t2 -T3 cdn.jsdelivr.net/gh/P3TERX/aria2.conf/$i || \
				curl -fsSLO p3terx.github.io/aria2.conf/$i
				[ -s $i ] || echo_time " $i 下载失败 !"
		done

		if [ -s aria2.conf ]; then
			sed -i "{
				s|path=/opt/etc|path=$pro|
				s|/opt/var/aria2/session.dat|$pro/aria2.session|g
			}" /opt/etc/init.d/S81aria2
			sed -i "{
				s|/root/\.aria2|$pro|g
				s|^dir=.*|dir=$download_dir|
				s|^rpc-se.*|rpc-secret=$webui_pass|
			}" aria2.conf
			sed -i '/033/d' {core,tracker.sh}
			sed -i 's|\#!/usr.*|\#!/bin/sh|g' *.sh
			chmod +x *.sh && sh ./tracker.sh >/dev/null 2>&1
			rm /opt/etc/aria2.conf
			ln -sf $pro/aria2.conf /opt/etc/aria2.conf
			ln -sf $pro/aria2.conf /opt/etc/config/aria2.conf
		fi
		aria2_port=$(uci get softwarecenter.main.aria2_port 2>/dev/null) && \
		sed -i "s/\(rpc-listen-port\).*/\1=$aria2_port/" $pro/aria2.conf

		wget -qO /tmp/ariang.zip `curl -Ls api.github.com/repos/mayswind/AriaNg/releases | grep -oE "https.*[0-9].zip" | head -1` && \
		unzip -oq /tmp/ariang.zip -d /opt/share/www/ariang-aria2

		if wget -qO /tmp/webui.zip github.com/ziahamza/webui-aria2/archive/refs/heads/master.zip; then
			unzip -oq /tmp/webui.zip -d /opt/share/www/
			mv /opt/share/www/webui* /opt/share/www/webui-aria2
		fi
		/opt/etc/init.d/S81aria2 restart >/dev/null 2>&1
		echo_time "登录WebUI的密码 $webui_pass"
		_pidof aria2c

	else
		echo_time "aria2 安装失败，再重试安装！"
		exit 1
	fi
}

install_deluge() {
	local time_out="timeout 3m"
	if opkg_install deluge-ui-web; then
		sed -i '{
			/deluged -l/a\\tsleep 3\n\t/opt/etc/init.d/S81deluge-web start
			/killall deluged/a\\tsleep 3\n\t/opt/etc/init.d/S81deluge-web stop
		}' /opt/etc/init.d/S80deluged
		cat <<-EOF >/opt/share/python_sha1.py # Deluge Password Calculatation
			#!/opt/bin/env python
			import hashlib
			import sys
			password = sys.argv[1]
			salt = sys.argv[2]
			s = hashlib.sha1()
			s.update(salt.encode('utf-8'))
			s.update(password.encode('utf-8'))
			print (s.hexdigest())
		EOF
		dwsalt="$(cat /dev/urandom | tr -dc 'a-eA-Z0-9' | head -c 40 | xargs)"
		dwsha1="$(/opt/bin/python /opt/share/python_sha1.py ${webui_pass} ${dwsalt})"
		cat <<-EOF >/opt/etc/deluge/web.conf
		{
			"language": "zh_CN",
			"pwd_salt": "$dwsalt",
			"pwd_sha1": "$dwsha1"
		}
		EOF
		cat <<-EOF >/opt/etc/deluge/core.conf
		{
			"cache_size": 32768,
			"queue_new_to_top": true,
			"new_release_check": false,
			"listen_random_port": null,
			"pre_allocate_storage": true,
			"download_location": "$download_dir",
			"move_completed_path": "$download_dir",
			"torrentfiles_location": "$download_dir"
		}
		EOF
		deluged_port=$(uci get softwarecenter.main.deluged_port 2>/dev/null) && \
		sed -i "/-p 888/s/888/$deluged_port/" /opt/etc/init.d/S81deluge-web
		ln -sf /opt/etc/deluge/core.conf /opt/etc/config/deluge.conf
		/opt/etc/init.d/S80deluged start >/dev/null 2>&1 && sleep 4
		/opt/etc/init.d/S80deluged restart >/dev/null 2>&1
		echo_time "登录WebUI的用户名 $webui_name 密码 $webui_pass"
		_pidof deluged
	else
		echo_time "deluge 安装失败，再重试安装！"
		exit 1
	fi
}

install_qbittorrent() {
	local time_out="timeout 1m"
	if opkg_install qbittorrent; then
		/opt/etc/init.d/S89qbittorrent start >/dev/null 2>&1 && sleep 2
		cat <<-EOF >/opt/etc/qBittorrent_entware/config/qBittorrent.conf
			[AutoRun]
			enabled=false
			program=
			[LegalNotice]
			Accepted=true
			[Network]
			Cookies=@Invalid()
			[BitTorrent]
			Session\MultiConnectionsPerIp=true
			[Preferences]
			Advanced\AutoBanUnknownPeer=true
			Bittorrent\AutoUpdateTrackers=true
			Bittorrent\CustomizeTrackersListUrl=https://trackerslist.com/all.txt
			Connection\PortRangeMin=44667
			Queueing\QueueingEnabled=false
			WebUI\CSRFProtection=false
			WebUI\Port=9080
			WebUI\LocalHostAuth=false
			WebUI\RootFolder=/opt/share/www/CzBiX-qb-web/
			General\Locale=zh
			Downloads\UseIncompleteExtension=true
			Downloads\SavePath=$download_dir
			Downloads\PreAllocation=true
		EOF
		qbittorrent_port=$(uci get softwarecenter.main.qbittorrent_port 2>/dev/null) && \
		sed -i "s/\(WebUI\Port\).*/\1=$qbittorrent_port/" /opt/etc/qBittorrent_entware/config/qBittorrent.conf
		[ $cpu_model == x86_64 ] && {
			if [ -z $(command -v qbpass) ]; then
				wget -qO /opt/bin/qbpass github.com/KozakaiAya/libqbpasswd/releases/download/v0.2/qb_password_gen_static
				chmod +x /opt/bin/qbpass
			fi
			cat <<-EOF >>/opt/etc/qBittorrent_entware/config/qBittorrent.conf
				WebUI\Username=$webui_name
				WebUI\Password_ha1=@ByteArray($pp)
				WebUI\Password_PBKDF2="@ByteArray($(/opt/bin/qbpass $webui_pass))"
			EOF
		}

		cd /opt/share/www
		[ -d CzBiX-qb-web ] || {
		if wget -qO CzBiX-qb-web.zip $(curl -sL api.github.com/repos/CzBiX/qb-web/releases | grep -oE "https.*download.*zip" | head -1); then
			unzip -qo CzBiX-qb-web.zip
			mv -f dist CzBiX-qb-web
			rm -f CzBiX-qb-web.zip
		fi
		}

		[ -d miniers-qb-web ] || {
		if curl -sL api.github.com/repos/miniers/qb-web/releases | grep -oE "https.*download.*zip" | head -1 | xargs wget -O miniers-qb-web.zip; then
			unzip -qo miniers-qb-web.zip -d miniers-qb-web
			rm -rf miniers-qb-web.zip
		fi
		}
		ln -sf /opt/etc/qBittorrent_entware/config/qBittorrent.conf /opt/etc/config/qBittorrent.conf
		/opt/etc/init.d/S89qbittorrent restart >/dev/null 2>&1
		echo_time "登录WebUI的用户名 $webui_name 密码 $webui_pass"
		_pidof qbittorrent-nox
	else
		echo_time "qBittorrent 安装失败，再重试安装！"
		exit 1
	fi
}

install_rtorrent() {
	local time_out="timeout 2m"
	if opkg_install rtorrent-easy-install; then
		sed -i '/^server.port/ {s/=.*/= 1099/}' /opt/etc/lighttpd/conf.d/99-rtorrent-fastcgi-scgi-auth.conf
		/opt/etc/init.d/S85rtorrent start >/dev/null 2>&1 && sleep 5
		/opt/etc/init.d/S85rtorrent stop >/dev/null 2>&1

		opkg_install ffmpeg mediainfo unrar php7-mod-json
		if wget -qO /tmp/rutorrent.zip https://github.com/Novik/ruTorrent/archive/refs/tags/$(curl -sL api.github.com/repos/Novik/ruTorrent/releases | grep zipball_url | sed -r 's/.*zipball\/(.*)",/\1/' | head -1).zip; then
			[ -d /opt/share/www/rutorrent ] && rm -rf /opt/share/www/rutorrent
			unzip -oq /tmp/rutorrent.zip -d /opt/share/www/ && \
			mv /opt/share/www/ruTorrent* /opt/share/www/rutorrent
		fi

		cat >/opt/share/www/rutorrent/conf/plugins.ini <<-\ENTWARE
			;; Plugins' permissions.
			;; If flag is not found in plugin section, corresponding flag from "default" section is used.
			;; If flag is not found in "default" section, it is assumed to be "yes".
			;;
			;; For setting individual plugin permissions you must write something like that:
			;;
			;; [ratio]
			;; enabled = yes ;; also may be "user-defined", in this case user can control plugin's state from UI
			;; canChangeToolbar = yes
			;; canChangeMenu = yes
			;; canChangeOptions = no
			;; canChangeTabs = yes
			;; canChangeColumns = yes
			;; canChangeStatusBar = yes
			;; canChangeCategory = yes
			;; canBeShutdowned = yes

			[default]
			enabled = user-defined
			canChangeToolbar = yes
			canChangeMenu = yes
			canChangeOptions = yes
			canChangeTabs = yes
			canChangeColumns = yes
			canChangeStatusBar = yes
			canChangeCategory = yes
			canBeShutdowned = yes

			;; Default
			[autodl-irssi]
			enabled = user-defined
			[cookies]
			enabled = user-defined
			[cpuload]
			enabled = user-defined
			[create]
			enabled = user-defined
			[data]
			enabled = user-defined
			[diskspace]
			enabled = user-defined
			[edit]
			enabled = user-defined
			[extratio]
			enabled = user-defined
			[extsearch]
			enabled = user-defined
			[filedrop]
			enabled = user-defined
			[geoip]
			enabled = user-defined
			[lookat]
			enabled = user-defined
			[mediainfo]
			enabled = user-defined
			[ratio]
			enabled = user-defined
			[rss]
			enabled = user-defined
			[rssurlrewrite]
			enabled = user-defined
			[screenshots]
			enabled = user-defined
			[show_peers_like_wtorrent]
			enabled = user-defined
			[throttle]
			enabled = user-defined
			[trafic]
			enabled = user-defined
			[unpack]
			enabled = user-defined

			;; Enabled
			[_cloudflare]
			enabled = no
			[_getdir]
			enabled = yes
			canBeShutdowned =no
			[_noty]
			enabled = yes
			canBeShutdowned =no
			[_task]
			enabled = yes
			canBeShutdowned =no
			[autotools]
			enabled = yes
			[datadir]
			enabled = yes
			[erasedata]
			enabled = yes
			[httprpc]
			enabled = yes
			canBeShutdowned = no
			[seedingtime]
			enabled = yes
			[source]
			enabled = yes
			[theme]
			enabled = yes
			[tracklabels]
			enabled = yes

			;; Disabled
			[check_port]
			enabled = yes
			[chunks]
			enabled = yes
			[feeds]
			enabled = no
			[history]
			enabled = yes
			[ipad]
			enabled = no
			[loginmgr]
			enabled = yes
			[retrackers]
			enabled = yes
			[rpc]
			enabled = yes
			[rutracker_check]
			enabled = yes
			[scheduler]
			enabled = yes
			[spectrogram]
			enabled = no
			[xmpp]
			enabled = no
		ENTWARE

		sed -i "{
			/scgi_port/ {s|5000|0|}
			/\"id\"/   {s|''|'/opt/bin/id'|}
			/\"curl\"/ {s|''|'/opt/bin/curl'|}
			/\"gzip\"/ {s|''|'/opt/bin/gzip'|}
			/\"stat\"/ {s|''|'/opt/bin/stat'|}
			/\"php\"/  {s|''|'/opt/bin/php-cgi'|}
			/scgi_host/ {s|127.0.0.1|unix:///opt/var/rpc.socket|}
			s|/tmp/errors.log|/opt/var/log/rutorrent_errors.log|
		}" /opt/share/www/rutorrent/conf/config.php

		cat >/opt/etc/rtorrent/rtorrent.conf <<-EOF
			# 高级设置：任务信息文件路径。用来生成任务信息文件，记录种子下载的进度等信息
			session.path.set = /opt/etc/rtorrent/session
			# 监听种子文件夹
			schedule2 = watch_directory,5,5,load_start=/opt/etc/rtorrent/watchdir/*.torrent
			# 监听目录中的新的种子文件，并停止那些已经被删除部分的种子
			schedule2 = untied_directory,5,5,stop_untied=
			# 当磁盘空间不足时停止下载
			schedule2 = low_diskspace,5,60,close_low_diskspace=100M
			# 高级设置：绑定 IP
			network.bind_address.set = 0.0.0.0
			# 选项将指定选用哪一个端口去侦听。建议使用高于 49152 的端口。虽然 rTorrent 允许使用多个的端口，还是建议使用单个的端口。
			network.port_range.set = 51411-51411
			# 是否使用随机端口
			# yes 是 / no 否
			# port_random = no
			network.port_random.set = no
			# 下载完成或 rTorrent 重新启动时对文件进行 Hash 校验。这将确保你下载/做种的文件没有错误( auto 自动/ yes 启动 / no 禁用)
			pieces.hash.on_completion.set = yes
			# 高级设置：支持 UDP 伺服器
			trackers.use_udp.set = yes
			# 如下例中的值将允许将接入连接加密，开始时以非加密方式作为连接的输出方式，
			# 如行不通则以加密方式进行重试，在加密握手后，优先选择将纯文本以 RC4 加密
			protocol.encryption.set = allow_incoming,enable_retry,prefer_plaintext
			# 是否启用 DHT 支持。
			# 如果你使用了 public trackers，你可能希望使能 DHT 以获得更多的连接。
			# 如果你仅仅使用了私有的连接 privite trackers ，请不要启用 DHT，因为这将降低你的速度，并可能造成一些泄密风险，如泄露 passkey。一些 PT 站点甚至会因为检测到你使用 DHT 而向你发出警告。
			# disable 完全禁止/ off 不启用/ auto 按需启用(即PT种子不启用，BT种子启用)/ on 启用
			dht.mode.set = auto
			# 启用 DHT 监听的 UDP 端口
			dht.port.set = 51412
			# 对未标记为私有的种子启用/禁用用户交换。默认情况下禁用。
			# yes 启用 / no 禁用
			protocol.pex.set = yes
			# 本地挂载点路径
			network.scgi.open_local = /opt/var/rpc.socket
			# 编码类型(UTF-8 支持中文显示，避免乱码)
			encoding.add = utf8
			# 每个种子的最大同时上传连接数
			throttle.max_uploads.set = 8
			# 全局上传通道数
			throttle.max_uploads.global.set = 32
			# 全局下载通道数
			throttle.max_downloads.global.set = 64
			# 全局的下载速度限制，“0”表示无限制
			# 默认单位为 B/s (设置为 4(B) 表示 4B/s；4K表示 4KB/s；4M 表示4MB/s；4G 表示 4GB/s)
			throttle.global_down.max_rate.set_kb = 0
			# 全局的上传速度限制，“0”表示无限制
			# 默认单位为 B/s (设置为 4(B) 表示 4B/s；4K表示 4KB/s；4M 表示4MB/s；4G 表示 4GB/s)
			throttle.global_up.max_rate.set_kb = 0
			# 默认下载路径(不支持绝对路径，如~/torrents)
			directory.default.set = $download_dir
			# 免登陆 Web 服务初始化 rutorrent 的插件
			execute2 = {sh,-c,/opt/bin/php-cgi /opt/share/www/rutorrent/php/initplugins.php $USER &}
		EOF

		echo '. /opt/etc/init.d/S80lighttpd $1 >/dev/null 2>&1' >> /opt/etc/init.d/S85rtorrent
		/opt/etc/init.d/S85rtorrent restart >/dev/null 2>&1
		ln -sf /opt/etc/rtorrent/rtorrent.conf /opt/etc/config/rtorrent.conf
		_pidof rtorrent

	else
		echo_time "rtorrent 安装失败，再重试安装！"
		exit 1
	fi
}

install_transmission() {
	local time_out="timeout 1m"
	[ $1 ] && pr="transmission-cfp-daemon transmission-cfp-cli transmission-cfp-remote" || pr="transmission-daemon transmission-cli transmission-remote"

	if opkg_install $pr; then
		if wget -qO /tmp/tr.zip https://github.com/ronggang/transmission-web-control/archive/refs/tags/$(curl -sL api.github.com/repos/ronggang/transmission-web-control/releases | grep zipball_url | sed -r 's/.*zipball\/(.*)",/\1/' | head -1).zip; then
			make_dir /opt/share/transmission
			unzip -oq /tmp/tr.zip -d /tmp
			mv /tmp/transmission-web-control*/src/ /opt/share/transmission/web
			sed -i '/original/d' /opt/share/transmission/web/*.html
		else
			echo_time "下载 transmission-web-control 出错！"
			opkg_install transmission-web-control
			echo_time "使用 Entware transmission-web-control"
		fi

		[ -e /opt/etc/init.d/S88transmission-cfp ] && mv /opt/etc/init.d/S88transmission-cfp /opt/etc/init.d/S88transmission
		sed -i '{
			/forwarding/ {s|false|true|}
			/authentication/ {s|false|true|}
			/username/s|: ".*"|: "'"$webui_name"'"|
			/password/s|: ".*"|: "'"$webui_pass"'"|
			/download-dir/s|: ".*"|: "'"$download_dir"'"|
		}' /opt/etc/transmission/settings.json
		transmission_port=$(uci get softwarecenter.main.transmission_port 2>/dev/null) && \
		sed -i "/rpc-port/s/9091/$transmission_port/" /opt/etc/config/transmission.json
		ln -sf /opt/etc/transmission/settings.json /opt/etc/config/transmission.json
		/opt/etc/init.d/S88transmission start >/dev/null 2>&1
		echo_time "登录WebUI的用户名 $webui_name 密码 $webui_pass"
		_pidof transmission

	else
		echo_time "transmission 安装失败，再重试安装！"
		exit 1
	fi
}

if [ $1 ]; then
	log="/tmp/log/softwarecenter.log"
	case $1 in
		amuled)
			install_amule >>$log
			;;
		aria2)
			install_aria2 >>$log
			;;
		deluged)
			install_deluge >>$log
			;;
		rtorrent)
			install_rtorrent >>$log
			;;
		qbittorrent)
			install_qbittorrent >>$log
			;;
		transmission)
			shift
			[ $1 = 2 ] && install_transmission 277 >>$log || \
						  install_transmission >>$log
			;;
		*) break ;;
	esac
fi
