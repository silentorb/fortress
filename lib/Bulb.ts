/**
 * User: Chris Johnson
 * Date: 11/9/2014
 */

/// <reference path="references.ts"/>

class Fortress extends Vineyard.Bulb {
  core:Core

  grow() {
    this.core = new Core(this.config, this.ground)
  }

  query_access(user:Vineyard.IUser, query:Ground.Query_Builder):Promise {
    if (typeof user !== 'object')
      throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".')

    if (!user.roles)
      throw new Error('User passed to update_access is missing a roles array.')

    var test = this.core.prepare_query_test(query)

    return this.core.run(user, test)
    //return when.resolve(result)
  }

  update_access(user:Vineyard.IUser, updates):Promise {
    if (typeof user !== 'object')
      throw new Error('Fortress.update_access() requires a valid user object, not "' + user + '".')

    if (!user.roles)
      throw new Error('User passed to update_access is missing a roles array.')

    if (!MetaHub.is_array(updates))
      updates = [updates]

    var test = this.core.prepare_update_test(updates)

    return this.core.run(user, test)
  }

  user_has_role(user, role_name:string):boolean {
    for (var i in user.roles) {
      if (user.roles[i].name == role_name)
        return true
    }
    return false
  }
}