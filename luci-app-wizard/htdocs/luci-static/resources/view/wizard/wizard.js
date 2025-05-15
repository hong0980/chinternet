'use strict';
'require view';
'require dom';
'require poll';
'require uci';
'require rpc';
'require form';
'require fs';

return view.extend({
	load: function() {
		return Promise.all([
			fs.exec('/etc/init.d/wizard', ['reconfig']),
			uci.changes(),
			L.resolveDefault(uci.load('wireless')),
			uci.load('wizard')
		]);
	},
	render: function(data) {

		var m, s, o;

		m = new form.Map('wizard', [_('Inital Router Setup')],
			_('If you are using this router for the first time, please configure it here.'));

		s = m.section(form.NamedSection, 'default', 'wizard');
		s.addremove = false;
		s.tab('wansetup', _('Wan Settings'), _('Three different ways to access the Internet, please choose according to your own situation.'));
		s.tab('lansetup', _('Lan Settings'));

		o = s.taboption('wansetup', form.ListValue, 'wan_proto', _('Protocol'));
		o.rmempty = false;
		o.default = 'dhcp';
		o.value('dhcp', _('DHCP client'));
		o.value('pppoe', _('PPPoE'));
		o.value('static', _('Static address'));

		o = s.taboption('wansetup', form.Value, 'wan_pppoe_user', _('PAP/CHAP username'));
		o.depends('wan_proto', 'pppoe');

		o = s.taboption('wansetup', form.Value, 'wan_pppoe_pass', _('PAP/CHAP password'));
		o.depends('wan_proto', 'pppoe');
		o.password = true;

		o = s.taboption('wansetup', form.ListValue, 'ppp_ipv6', _('Obtain IPv6 address'), _('Enable IPv6 negotiation on the PPP link'));
		o.ucioption = 'ipv6';
		o.depends('wan_proto', 'pppoe');
		o.value('auto', _('Automatic'));
		o.value('0', _('Disabled'));
		o.value('1', _('Manual'));
		o.default = 'auto';

		o = s.taboption('wansetup', form.Value, 'wan_netmask', _('IPv4 netmask'));
		o.depends('wan_proto', 'static');
		o.datatype = 'ip4addr';
		o.value('255.255.255.0');
		o.value('255.255.0.0');
		o.value('255.0.0.0');

		o = s.taboption('wansetup', form.Value, 'wan_gateway', _('IPv4 gateway'));
		o.depends('wan_proto', 'static');
		o.datatype = 'ip4addr';

		o = s.taboption('wansetup', form.DynamicList, 'lan_wan_dns', _('Use custom DNS servers'));
		o.datatype = 'ip4addr';
		o.ucioption = 'wan_dns';
		o.cast = 'string';
		o.value("223.5.5.5", _("AliDNS: 223.5.5.5"));
		o.value("223.6.6.6", _("AliDNS: 223.6.6.6"));
		o.value("101.226.4.6", _("DNSPod: 101.226.4.6"));
		o.value("218.30.118.6", _("DNSPod: 218.30.118.6"));
		o.value("180.76.76.76", _("BaiduDNS: 180.76.76.76"));
		o.value("114.114.114.114", _("114DNS: 114.114.114.114"));
		o.value("114.114.115.115", _("114DNS: 114.114.115.115"));

		o = s.taboption('lansetup', form.Value, 'lan_ipaddr', _('IPv4 address'));
		o.datatype = 'ip4addr';

		o = s.taboption('lansetup', form.Value, 'lan_netmask', _('IPv4 netmask'));
		o.datatype = 'ip4addr';
		o.value('255.255.255.0');
		o.value('255.255.0.0');
		o.value('255.0.0.0');

		if (uci.sections('wireless', 'wifi-device').length > 0) {
			s.tab('wifisetup', _('Wireless Settings'), _('Set the router\'s wireless name and password. For more advanced settings, please go to the Network-Wireless page.'));
			o = s.taboption('wifisetup', form.Value, 'wifi_ssid', _('<abbr title=\"Extended Service Set Identifier\">ESSID</abbr>'));
			o.datatype = 'maxlength(32)';

			o = s.taboption("wifisetup", form.Value, "wifi_key", _("Key"));
			o.datatype = 'wpakey';
			o.password = true;
		}

		return m.render();
	}
});
