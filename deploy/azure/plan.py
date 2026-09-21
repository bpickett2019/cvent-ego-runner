#!/usr/bin/env python3
"""Generate infrastructure only. Never contacts Azure or reads runtime credentials."""
import argparse
import ipaddress
import json
import re
from pathlib import Path

LOCATION = 'westus3'
SIZE = 'Standard_D4ps_v6'


def template(ssh_key, admin_cidr):
    network = ipaddress.ip_network(admin_cidr, strict=True)
    if network.version != 4 or network.prefixlen != 32 or not network.network_address.is_global:
        raise ValueError('Use one public administrator IPv4 address (/32), not an open SSH range')
    if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/]+={0,3}(?: [^\r\n]+)?', ssh_key.strip()):
        raise ValueError('An Ed25519 PUBLIC key is required')
    resources = []
    def resource(kind, name, properties, dependencies=(), **extra):
        item = dict(type=kind, apiVersion='2024-05-01' if kind.startswith('Microsoft.Network/') else '2024-07-01',
                    name=name, location=LOCATION, properties=properties, **extra)
        if dependencies:
            item['dependsOn'] = list(dependencies)
        resources.append(item)
    def rid(kind, name):
        return "[resourceId('%s', '%s')]" % (kind, name)
    nsg_kind = 'Microsoft.Network/networkSecurityGroups'
    # No implicit VNet peer access; only SSH from the administrator's /32.
    resource(nsg_kind, 'ego-ssh-only', {'securityRules': [
        {'name': 'AdminSSH', 'properties': {'priority': 100, 'direction': 'Inbound', 'access': 'Allow',
         'protocol': 'Tcp', 'sourcePortRange': '*', 'destinationPortRange': '22',
         'sourceAddressPrefix': str(network), 'destinationAddressPrefix': '*'}},
        {'name': 'DenyAllOtherInbound', 'properties': {'priority': 200, 'direction': 'Inbound', 'access': 'Deny',
         'protocol': '*', 'sourcePortRange': '*', 'destinationPortRange': '*',
         'sourceAddressPrefix': '*', 'destinationAddressPrefix': '*'}}]})
    vnet_kind = 'Microsoft.Network/virtualNetworks'
    resource(vnet_kind, 'ego-vnet', {'addressSpace': {'addressPrefixes': ['10.73.0.0/24']},
             'subnets': [{'name': 'instances', 'properties': {'addressPrefix': '10.73.0.0/24'}}]})
    for index in range(1, 4):
        name = f'cvent-ego-{index}'
        pip_kind, nic_kind = 'Microsoft.Network/publicIPAddresses', 'Microsoft.Network/networkInterfaces'
        resource(pip_kind, name+'-ip', {'publicIPAllocationMethod': 'Static', 'publicIPAddressVersion': 'IPv4'}, sku={'name': 'Standard'})
        resource(nic_kind, name+'-nic', {
            'networkSecurityGroup': {'id': rid(nsg_kind, 'ego-ssh-only')},
            'ipConfigurations': [{'name': 'primary', 'properties': {
                'privateIPAllocationMethod': 'Dynamic',
                'subnet': {'id': "[resourceId('Microsoft.Network/virtualNetworks/subnets', 'ego-vnet', 'instances')]"},
                'publicIPAddress': {'id': rid(pip_kind, name+'-ip')}}}]},
            [rid(nsg_kind, 'ego-ssh-only'), rid(vnet_kind, 'ego-vnet'), rid(pip_kind, name+'-ip')])
        resource('Microsoft.Compute/virtualMachines', name, {
            'hardwareProfile': {'vmSize': SIZE},
            'storageProfile': {
                'imageReference': {'publisher': 'Canonical', 'offer': 'ubuntu-24_04-lts',
                                   'sku': 'server-arm64', 'version': '24.04.202609040'},
                'osDisk': {'createOption': 'FromImage', 'diskSizeGB': 64,
                           'managedDisk': {'storageAccountType': 'Premium_LRS'}, 'deleteOption': 'Detach'}},
            'osProfile': {'computerName': name, 'adminUsername': 'egoadmin',
                'linuxConfiguration': {'disablePasswordAuthentication': True,
                    'ssh': {'publicKeys': [{'path': '/home/egoadmin/.ssh/authorized_keys', 'keyData': ssh_key.strip()}]}}},
            'securityProfile': {'securityType': 'TrustedLaunch',
                                'uefiSettings': {'secureBootEnabled': True, 'vTpmEnabled': True}},
            'networkProfile': {'networkInterfaces': [{'id': rid(nic_kind, name+'-nic')}]}},
            [rid(nic_kind, name+'-nic')], tags={'application': 'cvent-ego-runner', 'purpose': 'isolated-pilot', 'slot': str(index)})
    return {'$schema': 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
            'contentVersion': '1.0.0.0', 'resources': resources,
            'outputs': {'status': {'type': 'string', 'value': 'INFRASTRUCTURE ONLY: app, credentials, user access and concurrency acceptance still required'}}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ssh-public-key', type=Path, required=True)
    parser.add_argument('--admin-cidr', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = template(args.ssh_public_key.read_text(), args.admin_cidr)
    with args.output.open('x') as stream:
        stream.write(json.dumps(result, indent=2)+'\n')
    print('Infrastructure template generated; nothing deployed.')
