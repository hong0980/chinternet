'use strict';

// 导入 LuCI 框架所需的模块
'require view';        // 视图基类，用于定义页面
'require dom';         // DOM 操作工具库
'require poll';        // 数据轮询模块（未使用，可能预留）
'require uci';         // UCI 配置交互模块，用于读写配置文件
'require rpc';         // 远程过程调用模块，用于与后端交互
'require form';        // 表单模块，用于生成配置界面
'require fs';          // 文件系统模块，用于执行系统命令
'require network';     // 网络模块，用于获取设备接口
'require tools.widgets as widgets'; // 工具模块，提供 DeviceSelect 等控件

return view.extend({
	// load 方法：在页面渲染前异步加载数据
	load: function() {
		return Promise.all([
			fs.exec('/etc/init.d/wizard', ['reconfig']), // 执行 wizard 初始化命令
			uci.changes(),                              // 检查 UCI 配置的未保存更改
			L.resolveDefault(uci.load('wireless')),     // 加载 wireless 配置文件，失败时返回默认值
			uci.load('wizard'),                         // 加载 wizard 配置文件
			uci.load('network'),                        // 加载 network 配置文件，用于获取网络接口列表
			uci.load('firewall')                        // 加载 firewall 配置文件，用于防火墙设置
		]);
	},

	// render 方法：定义页面 UI 结构和内容
	render: function(data) {
		var m, s, o;

		// 创建表单，绑定到 wizard 配置文件，设置标题和描述
		m = new form.Map('wizard', [_('Inital Router Setup')],
			_('If you are using this router for the first time, please configure it here.'));

		// 创建 named section，绑定 wizard 配置的 default 部分
		s = m.section(form.NamedSection, 'default', 'wizard');
		s.addremove = false; // 禁止删除或添加此配置部分
		// 添加选项卡：WAN 设置和 LAN 设置
		s.tab('wansetup', _('Wan Settings'),
			_('Three different ways to access the Internet, please choose according to your own situation.'));
		s.tab('lansetup', _('Lan Settings'));

		// WAN 协议选择
		o = s.taboption('wansetup', form.ListValue, 'wan_proto', _('Protocol'));
		o.rmempty = false; // 禁止为空
		o.default = 'dhcp'; // 默认选择 DHCP
		// 添加协议选项
		o.value('dhcp', _('DHCP client'),
			_('选择网络接入协议，决定路由器如何连接到互联网。保存到 network.wan.proto。'));
		o.value('pppoe', _('PPPoE'));      // PPPoE 拨号
		o.value('static', _('Static address')); // 静态地址
		o.value('ap', _('交换机 (AP)'));   // 接入点模式
		o.value('siderouter', _('旁路由')); // 旁路路由模式

		// PPPoE 用户名输入框，仅在选择 PPPoE 协议时显示
		o = s.taboption('wansetup', form.Value, 'wan_pppoe_user', _('PAP/CHAP username'),
			_('PPPoE 拨号的用户名。保存到 network.wan.username。'));
		o.depends('wan_proto', 'pppoe');
		o.rmempty = false; // 禁止为空

		// PPPoE 密码输入框，仅在选择 PPPoE 协议时显示
		o = s.taboption('wansetup', form.Value, 'wan_pppoe_pass', _('PAP/CHAP password'),
			_('PPPoE 拨号的密码。保存到 network.wan.password。'));
		o.depends('wan_proto', 'pppoe');
		o.rmempty = false; // 禁止为空
		o.password = true; // 显示为密码输入框

		// IPv6 地址获取方式，仅在选择 PPPoE 协议时显示
		o = s.taboption('wansetup', form.ListValue, 'ppp_ipv6', _('Obtain IPv6 address'),
			_('Enable IPv6 negotiation on the PPP link'));
		o.ucioption = 'ipv6'; // 保存到 UCI 的 ipv6 选项
		o.depends('wan_proto', 'pppoe');
		o.value('auto', _('Automatic')); // 自动获取
		o.value('0', _('Disabled'));    // 禁用
		o.value('1', _('Manual'));      // 手动配置
		o.default = 'auto';             // 默认自动获取

		// IPv4 子网掩码，仅在选择静态地址时显示
		o = s.taboption('wansetup', form.Value, 'wan_netmask', _('IPv4 netmask'),
			_('静态地址模式的子网掩码。保存到 network.wan.netmask。'));
		o.depends('wan_proto', 'static');
		o.datatype = 'ip4addr'; // 验证输入为 IPv4 格式（实际为子网掩码）
		o.value('255.255.255.0'); // 常见子网掩码
		o.value('255.255.0.0');
		o.value('255.0.0.0');

		// IPv4 网关，仅在选择静态地址时显示
		o = s.taboption('wansetup', form.Value, 'wan_gateway', _('IPv4 gateway'),
			_('静态地址模式的网关地址。保存到 network.wan.gateway。'));
		o.depends('wan_proto', 'static');
		o.datatype = 'ip4addr'; // 验证输入为 IPv4 地址

		// === 接入点模式 (AP) 配置选项 ===
		// 桥接 IP 地址：设置路由器在 AP 模式下的静态 IP 地址，仅在选择 AP 模式时显示
		o = s.taboption('wansetup', form.Value, 'ap_bridge_ip', _('Bridge IP address'),
			_('路由器在接入点模式下分配的静态 IP 地址，用于连接主网络。保存到 network.lan.ipaddr。'));
		o.depends('wan_proto', 'ap');
		o.datatype = 'ip4addr'; // 验证输入为 IPv4 地址
		o.placeholder = '192.168.1.2'; // 提示示例 IP 地址

		// 子网掩码：设置 AP 模式下的子网掩码，与主网络一致，仅在选择 AP 模式时显示
		o = s.taboption('wansetup', form.Value, 'ap_netmask', _('Bridge netmask'),
			_('接入点模式下路由器的子网掩码，应与主网络一致。保存到 network.lan.netmask。'));
		o.depends('wan_proto', 'ap');
		o.datatype = 'ip4addr'; // 验证输入为 IPv4 格式（实际为子网掩码）
		o.value('255.255.255.0'); // 常见子网掩码
		o.value('255.255.0.0');
		o.value('255.0.0.0');

		// 网关地址：设置主网络的网关地址，仅在选择 AP 模式时显示
		o = s.taboption('wansetup', form.Value, 'ap_gateway', _('Bridge gateway'),
			_('主网络的网关地址，通常为主路由器的 IP 地址。保存到 network.lan.gateway。'));
		o.depends('wan_proto', 'ap');
		o.datatype = 'ip4addr'; // 验证输入为 IPv4 地址
		o.placeholder = '192.168.1.1'; // 提示示例网关地址（主路由器 IP）

		// 禁用 DHCP：选择是否禁用 DHCP 服务，仅在选择 AP 模式时显示
		o = s.taboption('wansetup', form.ListValue, 'ap_dhcp', _('DHCP for AP mode'),
			_('禁用 DHCP 以依赖主路由器的 DHCP 服务器，或启用本地 DHCP 服务。保存到 dhcp.lan.ignore。'));
		o.depends('wan_proto', 'ap');
		o.value('0', _('Disabled')); // 禁用 DHCP
		o.value('1', _('Enabled'));  // 启用 DHCP
		o.default = '0'; // 默认禁用

		// 桥接接口：动态选择参与桥接的网络接口，仅在选择 AP 模式时显示
		o = s.taboption('wansetup', widgets.DeviceSelect, 'ap_bridge_interfaces', _('Bridge interfaces'),
			_('选择参与桥接的网络接口（如 LAN 或无线接口），以连接主网络。保存到 network.lan.ifname。'));
		o.depends('wan_proto', 'ap');
		o.multiple = true; // 允许选择多个接口
		o.noaliases = true; // 仅显示物理接口
		o.ucioption = 'ap_bridge_interfaces'; // 保存到 UCI 的 ap_bridge_interfaces 选项

		// === 旁路路由模式 (Siderouter) 配置选项 ===
		// 本地 IP 地址：设置旁路路由器自身的 IP 地址，仅在选择旁路路由模式时显示
		o = s.taboption('wansetup', form.Value, 'siderouter_local_ip', _('Local IP address'),
			_('旁路路由器在主网络中分配的 IP 地址，应避免与主路由器 LAN 子网冲突。保存到 network.lan.ipaddr。'));
		o.depends('wan_proto', 'siderouter');
		o.datatype = 'ip4addr'; // 验证输入为 IPv4 地址
		o.placeholder = '192.168.2.2'; // 提示示例 IP 地址（默认建议不同子网）
		o.validate = function(section_id, value) {
			var mainRouterIp = this.map.findElement('id', 'cbid.wizard.default.siderouter_main_router_ip').value || '192.168.1.1';
			var mainRouterNetmask = '255.255.255.0'; // 假设主路由器使用常见子网掩码
			var siderouterIp = value;

			// 简单子网检查
			var mainRouterParts = mainRouterIp.split('.').map(Number);
			var siderouterParts = siderouterIp.split('.').map(Number);
			var netmaskParts = mainRouterNetmask.split('.').map(Number);

			var inSameSubnet = true;
			for (var i = 0; i < 4; i++) {
				if ((mainRouterParts[i] & netmaskParts[i]) !== (siderouterParts[i] & netmaskParts[i])) {
					inSameSubnet = false;
					break;
				}
			}

			if (inSameSubnet) {
				return _('The local IP address should not be in the same subnet as the main router IP (%s). Try a different subnet, e.g., 192.168.2.x.').format(mainRouterIp);
			}

			return true;
		};

		// 子网掩码：设置旁路路由器的子网掩码，仅在选择旁路路由模式时显示
		o = s.taboption('wansetup', form.Value, 'siderouter_netmask', _('Netmask for side router'),
			_('旁路路由器的子网掩码，应与主网络一致。保存到 network.lan.netmask。'));
		o.depends('wan_proto', 'siderouter');
		o.datatype = 'ip4addr'; // 验证输入为 IPv4 格式（实际为子网掩码）
		o.value('255.255.255.0'); // 常见子网掩码
		o.value('255.255.0.0');
		o.value('255.0.0.0');

		// 主路由器 IP 地址：设置主路由器的 IP 地址，仅在选择旁路路由模式时显示
		o = s.taboption('wansetup', form.Value, 'siderouter_main_router_ip', _('Main router IP address'),
			_('旁路路由器连接的主路由器的 IP 地址。保存到 network.wan.gateway。'));
		o.depends('wan_proto', 'siderouter');
		o.datatype = 'ip4addr'; // 验证输入为 IPv4 地址
		o.placeholder = '192.168.1.1'; // 提示示例 IP 地址（主路由器默认地址）

		// 网关地址：设置旁路路由器的默认网关地址，仅在选择旁路路由模式时显示
		o = s.taboption('wansetup', form.Value, 'siderouter_gateway', _('Gateway for side router'),
			_('旁路路由器的默认网关地址，通常为主路由器的 IP 地址。保存到 network.wan.gateway。'));
		o.depends('wan_proto', 'siderouter');
		o.datatype = 'ip4addr'; // 验证输入为 IPv4 地址
		o.placeholder = '192.168.1.1'; // 提示示例网关地址

		// 禁用 DHCP：选择是否禁用 DHCP 服务，仅在选择旁路路由模式时显示
		o = s.taboption('wansetup', form.ListValue, 'siderouter_dhcp', _('DHCP for side router'),
			_('禁用 DHCP 以依赖主路由器的 DHCP 服务器，或启用本地 DHCP 服务。保存到 dhcp.lan.ignore。'));
		o.depends('wan_proto', 'siderouter');
		o.value('0', _('Disabled')); // 禁用 DHCP
		o.value('1', _('Enabled'));  // 启用 DHCP
		o.default = '0'; // 默认禁用

		// 连接接口：动态选择连接主网络的接口，仅在选择旁路路由模式时显示
		o = s.taboption('wansetup', widgets.DeviceSelect, 'siderouter_interfaces', _('Connection interfaces'),
			_('选择旁路路由器连接主网络的接口（如 WAN 或 LAN 端口）。保存到 network.wan.ifname（以空格分隔）。'));
		o.depends('wan_proto', 'siderouter');
		o.multiple = true; // 允许选择多个接口
		o.noaliases = true; // 仅显示物理接口
		o.ucioption = 'siderouter_interfaces'; // 保存到 UCI 的 siderouter_interfaces 选项

		// WAN 自定义 DNS 服务器列表
		o = s.taboption('wansetup', form.DynamicList, 'wan_dns', _('WAN DNS servers'),
			_('WAN 接口的自定义 DNS 服务器列表。保存到 network.wan.dns。'));
		o.datatype = 'ip4addr'; // 验证输入为 IPv4 地址
		o.ucioption = 'wan_dns'; // 保存到 UCI 的 wan_dns 选项
		o.cast = 'string'; // 强制转换为字符串存储
		// 预定义常用 DNS 服务器
		o.value("223.5.5.5", _("AliDNS: 223.5.5.5")); // 阿里DNS
		o.value("223.6.6.6", _("AliDNS: 223.6.6.6"));
		o.value("101.226.4.6", _("DNSPod: 101.226.4.6")); // DNSPod
		o.value("218.30.118.6", _("DNSPod: 218.30.118.6"));
		o.value("180.76.76.76", _("BaiduDNS: 180.76.76.76")); // 百度DNS
		o.value("114.114.114.114", _("114DNS: 114.114.114.114")); // 114DNS
		o.value("114.114.115.115", _("114DNS: 114.114.115.115"));

		// LAN IPv4 地址
		o = s.taboption('lansetup', form.Value, 'lan_ipaddr', _('IPv4 address'),
			_('LAN 接口的 IPv4 地址。保存到 network.lan.ipaddr。'));
		o.datatype = 'ip4addr'; // 验证输入为 IPv4 地址

		// LAN 子网掩码
		o = s.taboption('lansetup', form.Value, 'lan_netmask', _('IPv4 netmask'),
			_('LAN 接口的子网掩码。保存到 network.lan.netmask。'));
		o.datatype = 'ip4addr'; // 验证输入为 IPv4 格式（实际为子网掩码）
		o.value('255.255.255.0'); // 常见子网掩码
		o.value('255.255.0.0');
		o.value('255.0.0.0');

		// LAN 自定义 DNS 服务器列表
		o = s.taboption('lansetup', form.DynamicList, 'lan_dns', _('LAN DNS servers'),
			_('LAN 客户端（DHCP）使用的自定义 DNS 服务器列表。保存到 dhcp.lan.dhcp_option。'));
		o.datatype = 'ip4addr'; // 验证输入为 IPv4 地址
		o.cast = 'string'; // 强制转换为字符串存储
		// 预定义常用 DNS 服务器
		o.value("223.5.5.5", _("AliDNS: 223.5.5.5")); // 阿里DNS
		o.value("223.6.6.6", _("AliDNS: 223.6.6.6"));
		o.value("101.226.4.6", _("DNSPod: 101.226.4.6")); // DNSPod
		o.value("218.30.118.6", _("DNSPod: 218.30.118.6"));
		o.value("180.76.76.76", _("BaiduDNS: 180.76.76.76")); // 百度DNS
		o.value("114.114.114.114", _("114DNS: 114.114.114.114")); // 114DNS
		o.value("114.114.115.115", _("114DNS: 114.114.115.115"));

		// 如果存在无线设备，添加无线设置选项卡
		if (uci.sections('wireless', 'wifi-device').length > 0) {
			// 添加无线设置选项卡
			s.tab('wifisetup', _('Wireless Settings'),
				_('Set the router\'s wireless name and password. For more advanced settings, please go to the Network-Wireless page.'));
			// 无线 SSID 输入框
			o = s.taboption('wifisetup', form.Value, 'wifi_ssid', _('<abbr title=\"Extended Service Set Identifier\">ESSID</abbr>'),
				_('无线网络的 SSID，长度不超过 32 个字符。保存到 wireless.@wifi-iface[].ssid。'));
			o.datatype = 'maxlength(32)'; // 限制长度为 32 个字符

			// 无线密码输入框
			o = s.taboption('wifisetup', form.Value, 'wifi_key', _('Key'),
				_('无线网络的密码，符合 WPA 密钥要求。保存到 wireless.@wifi-iface[].key。'));
			o.datatype = 'wpakey'; // 验证输入为 WPA 密钥（8-63 字符）
			o.password = true; // 显示为密码输入框
		}

		// 渲染并返回表单 HTML 结构
		return m.render();
	}
});
