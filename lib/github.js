export class GitHubClient {
  constructor(token) {
    this.token = token.trim()
  }

  async request(path, options = {}) {
    const response = await fetch('https://api.github.com' + path, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: 'Bearer ' + this.token,
        ...(options.headers || {})
      }
    })
    const text = await response.text()
    const data = text ? JSON.parse(text) : {}
    if (!response.ok) throw new Error(data.message || ('GitHub HTTP ' + response.status))
    return data
  }

  me() { return this.request('/user') }

  listRepos() {
    return this.request('/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member')
  }

  createRepo({ name, description = '', isPrivate = true }) {
    return this.request('/user/repos', {
      method: 'POST',
      body: JSON.stringify({ name, description, private: isPrivate, auto_init: true })
    })
  }

  repo(owner, name) {
    return this.request('/repos/' + owner + '/' + name)
  }

  root(owner, name, ref) {
    return this.request('/repos/' + owner + '/' + name + '/contents?ref=' + encodeURIComponent(ref))
  }

  async file(owner, name, path, ref) {
    const data = await this.request('/repos/' + owner + '/' + name + '/contents/' + path + '?ref=' + encodeURIComponent(ref))
    return {
      ...data,
      decoded: data.content ? decodeURIComponent(escape(atob(data.content.replace(/\n/g, '')))) : ''
    }
  }

  async branch(owner, name, branchName, baseRef) {
    const ref = await this.request('/repos/' + owner + '/' + name + '/git/ref/heads/' + encodeURIComponent(baseRef))
    return this.request('/repos/' + owner + '/' + name + '/git/refs', {
      method: 'POST',
      body: JSON.stringify({ ref: 'refs/heads/' + branchName, sha: ref.object.sha })
    })
  }

  async putFile(owner, name, path, content, message, branch, sha = undefined) {
    const payload = {
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      branch
    }
    if (sha) payload.sha = sha
    return this.request('/repos/' + owner + '/' + name + '/contents/' + path, {
      method: 'PUT',
      body: JSON.stringify(payload)
    })
  }

  createPR(owner, name, title, head, base, body = '') {
    return this.request('/repos/' + owner + '/' + name + '/pulls', {
      method: 'POST',
      body: JSON.stringify({ title, head, base, body })
    })
  }
}

export function splitRepo(fullName) {
  const [owner, name] = String(fullName || '').split('/')
  if (!owner || !name) throw new Error('Repositório inválido.')
  return { owner, name }
}