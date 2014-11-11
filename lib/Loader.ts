/**
 * User: Chris Johnson
 * Date: 11/9/2014
 */

/// <reference path="references.ts"/>

interface Gate_Source {
  type:string
  roles:string[]
  actions:string[]
  resources:any
}

interface Fortress_Source {
  zones:Zone_Source[]
}

interface Zone_Source {
  roles:string[]
  gates:Gate_Source[]
}

class Loader {
  static gate_types = {}

  static load(path:string):Zone[] {
    Loader.gate_types['global'] = Global
    Loader.gate_types['user_content'] = User_Content
    Loader.gate_types['path'] = Link

    var fs = require('fs')
    var json = fs.readFileSync(path, 'ascii')
    var config:Fortress_Source = JSON.parse(json.toString())

    var zones = []
    for (var i = 0; i < config.zones.length; ++i) {
      var zone = this.create_zone(config.zones[i])
      zones.push(zone)
    }

    return zones
  }

  static create_zone(source:Zone_Source) {
    var zone = {
      roles: source.roles,
      gates: []
    }
    for (var i = 0; i < source.gates.length; ++i) {
      this.add_gate(zone, source.gates[i])
    }

    return zone
  }

  static add_gate(zone, source:Gate_Source) {
    var type = Loader.gate_types[source.type]
    if (!type)
      throw new Error('Could not find gate: "' + source.type + '".')

    var gate = new type(source)
    zone.gates.push(gate)
  }
}