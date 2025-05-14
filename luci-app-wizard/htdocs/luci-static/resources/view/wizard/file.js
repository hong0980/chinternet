'use strict';
'require view';
'require rpc';
'require fs';
'require ui';

var isReadonlyView = !L.hasViewPermission() || null;
var configFiles = [
	'/etc/config/network',
	'/etc/config/firewall',
	'/etc/config/dhcp',
	'/etc/dnsmasq.conf',
	'/etc/config/uhttpd',
	'/etc/config/wireless',
	'/etc/hosts',
	'/etc/rc.local',
	'/etc/crontabs/root'
].map(function(path) {
	return {
		path: path,
		data_tab: path.split('/').pop(),
		title: path.split('/').pop().replace(/^./, function(c) { return c.toUpperCase(); }) +  _(' Configuration File')
	};
});

return view.extend({
	callRcList: rpc.declare({
		object: 'rc',
		method: 'list',
		expect: { '': {} }
	}),

	callRcInit: rpc.declare({
		object: 'rc',
		method: 'init',
		params: ['name', 'action']
	}),

	load: function() {
		return Promise.all([
			...configFiles.map(function(config) {
				return L.resolveDefault(fs.read(config.path), null);
			}),
			this.callRcList()
		]);
	},

	handleAction: function(name, action, ev) {
		return this.callRcInit(name, action).then(function(ret) {
			if (ret) throw _('Command failed');
			return true;
		}).catch(function(e) {
			ui.addNotification(null, E('p', _('Failed to execute "/etc/init.d/%s %s" action: %s').format(name, action, e)));
		});
	},

	handleEnableDisable: function(name, isEnabled, ev) {
		return this.handleAction(name, isEnabled ? 'disable' : 'enable', ev).then(L.bind(function(name, isEnabled, btn) {
			btn.parentNode.replaceChild(this.renderEnableDisable({
				name: name,
				enabled: isEnabled
			}), btn);
		}, this, name, !isEnabled, ev.currentTarget));
	},

	renderEnableDisable: function(init) {
		return E('button', {
			class: 'btn cbi-button-%s'.format(init.enabled ? 'positive' : 'negative'),
			click: ui.createHandlerFn(this, 'handleEnableDisable', init.name, init.enabled),
			disabled: isReadonlyView
		}, init.enabled ? _('Enabled') : _('Disabled'));
	},

	handleFileSave: function(path, textareaId) {
		var value = (document.getElementById(textareaId)?.value || '').trim().replace(/\r\n/g, '\n') + '\n';
		if (!document.getElementById(textareaId)) {
			ui.addNotification(null, E('p', _('Textarea not found: %s').format(textareaId)), 'error');
			return Promise.resolve();
		}

		return fs.write(path, value).then(function() {
			document.getElementById(textareaId).value = value;
			ui.addNotification(null, E('p', _('Contents of %s have been saved.').format(path)), 'info');

			var service = path === '/etc/crontabs/root' ? 'cron' :
						 path.includes('network') ? 'network' :
						 path.includes('firewall') ? 'firewall' :
						 path.includes('dhcp') ? 'dnsmasq' :
						 path.includes('dnsmasq') ? 'dnsmasq' :
						 path.includes('uhttpd') ? 'uhttpd' : null;
			if (service) {
				var init = '/etc/init.d/' + service
				return fs.exec_direct(init, ['reload']).then(function() {
					ui.addNotification(null, E('p', _('Service %s reloaded successfully.').format(init)), 'info');
				}).catch(function(err) {
					ui.addNotification(null, E('p', _('Service reload failed: %s').format(err.message)), 'warning');
				});
			}
		}).catch(function(err) {
			ui.addNotification(null, E('p', _('Unable to save contents: %s').format(err.message)), 'error');
		});
	},

	render: function(data) {
		var self = this;
		var tabContents = configFiles.map(function(config, index) {
			var content = data[index];
			return content ? E('div', { 'class': 'cbi-tab', 'data-tab': config.data_tab, 'data-tab-title': config.title }, [
				E('p', {}, _('Edit <code>%s</code> configuration file, changes take effect after saving and restarting.').format(config.path)),
				E('textarea', {
					'rows': 25,
					'id': config.data_tab,
					'disabled': isReadonlyView,
					'style': 'width:100%; background-color:#272626; color:#c5c5b2; border:1px solid #555; font-family:Consolas, monospace; font-size:14px;'
				}, [content]),
				E('div', { 'class': 'cbi-page-actions' }, [
					E('button', {
						'class': 'btn cbi-button-save',
						'disabled': isReadonlyView,
						'click': ui.createHandlerFn(self, 'handleFileSave', config.path, config.data_tab)
					}, _('Save'))
				])
			]) : null;
		}).filter(function(item) { return !!item; });

		var view = E('div', {}, [
			E('p', { 'style': 'color: red' }, _('<b>Warning:</b> Modifying configuration files may cause the system to fail to start or connect to the network, proceed with caution!')),
			E('div', { 'class': 'cbi-tab-container' }, tabContents)
		]);

		ui.tabs.initTabGroup(view.lastElementChild.childNodes);
		return view;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
