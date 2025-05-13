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
].map(path => ({
	path,
	data_tab: path.split('/').pop(),
	title: _(path.split('/').pop().replace(/^./, c => c.toUpperCase()) + ' 配置文件')
}));

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
			...configFiles.map(config =>
				L.resolveDefault(fs.stat(config.path), null)
					.then(stat => stat ? L.resolveDefault(fs.read(config.path), '') : null)
			),
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

	handleFileSave: function(path, textareaId) {
		var value = (document.getElementById(textareaId)?.value || '').trim().replace(/\r\n/g, '\n') + '\n';
		if (!document.getElementById(textareaId)) {
			ui.addNotification(null, E('p', _('Textarea not found: %s').format(textareaId)), 'error');
			return Promise.resolve();
		}

		return fs.write(path, value).then(() => {
			document.getElementById(textareaId).value = value;
			ui.addNotification(null, E('p', _('Contents have been saved.')), 'info');

			var service = path === '/etc/crontabs/root' ? 'cron' :
						   path.includes('network') ? 'network' :
						   path.includes('firewall') ? 'firewall' :
						   path.includes('dhcp') ? 'dnsmasq' :
						   path.includes('dnsmasq') ? 'dnsmasq' :
						   path.includes('uhttpd') ? 'uhttpd' : null;
			if (service) {
				return fs.exec_direct('/etc/init.d/' + service, ['reload']).then(() => {
					ui.addNotification(null, E('p', _('Service reloaded successfully.')), 'info');
				}).catch(err => {
					ui.addNotification(null, E('p', _('Service reload failed: %s').format(err.message)), 'warning');
				});
			}
		}).catch(err => {
			ui.addNotification(null, E('p', _('Unable to save contents: %s').format(err.message)), 'error');
		});
	},

	renderEnableDisable: function(init) {
		return E('button', {
			class: 'btn cbi-button-%s'.format(init.enabled ? 'positive' : 'negative'),
			click: ui.createHandlerFn(this, 'handleEnableDisable', init.name, init.enabled),
			disabled: isReadonlyView
		}, init.enabled ? _('Enabled') : _('Disabled'));
	},

	render: function(data) {
		var tabContents = configFiles.map((config, index) => {
			var content = data[index];
			return content ? E('div', { 'class': 'cbi-tab', 'data-tab': config.data_tab, 'data-tab-title': config.title }, [
				E('p', {}, _('编辑<code>%s</code>配置文件，保存后重启生效。').format(config.path)),
				E('textarea', {
					'id': `${config.data_tab}-textarea`,
					'rows': 25,
					'style': 'width:100%; background-color:#272626; color:#c5c5b2; border:1px solid #555; font-family:Consolas, monospace; font-size:14px;',
					'disabled': isReadonlyView
				}, [content]),
				E('div', { 'class': 'cbi-page-actions' }, [
					E('button', {
						'class': 'btn cbi-button-save',
						'id': `${config.data_tab}-button`,
						'disabled': isReadonlyView,
						'click': ui.createHandlerFn(this, 'handleFileSave', config.path, `${config.data_tab}-textarea`)
					}, _('Save'))
				])
			]) : null;
		}).filter(Boolean);

		var view = E('div', {}, [
			E('p', { 'style': 'color: red' }, _('<b>警告:</b> 修改配置文件可能导致系统无法启动或联网，请谨慎操作！')),
			E('div', { 'class': 'cbi-tab-container' }, tabContents)
		]);

		ui.tabs.initTabGroup(view.lastElementChild.childNodes);
		return view;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
