# clearbluejar.github.io 

Site for random code and ramblings. 

## Development

The development cycle is quite staightforward if you use docker. No dependencies to install!  

Clone your repo:
```terminal
$ git clone clearbluejar/clearbluejar.github.io
$ cd clearbluejar.github.io
```

Then startup docker. The `jekyll:jekyll` docker image will build your site and host it locally:

```terminal
$ docker run -it --rm \
    --volume="$PWD:/srv/jekyll" \
    -p 4000:4000 jekyll/jekyll \
    jekyll serve


Fetching gem metadata from https://rubygems.org/.........
Using public_suffix 4.0.6
Using bundler 2.2.24
Using colorator 1.1.0
Using concurrent-ruby 1.1.9

... several line omitted ...

Fetching jekyll-theme-chirpy 5.1.0
Installing jekyll-theme-chirpy 5.1.0
Bundle complete! 7 Gemfile dependencies, 44 gems now installed.
Use `bundle info [gemname]` to see where a bundled gem is installed.
ruby 2.7.1p83 (2020-03-31 revision a0c7c23c9c) [x86_64-linux-musl]
Configuration file: /srv/jekyll/_config.yml
 Theme Config file: /usr/gem/gems/jekyll-theme-chirpy-5.1.0/_config.yml
            Source: /srv/jekyll
       Destination: /srv/jekyll/_site
 Incremental build: disabled. Enable with --incremental
      Generating...
                    done in 4.505 seconds.
 Auto-regeneration: enabled for '/srv/jekyll'
    Server address: http://0.0.0.0:4000/
  Server running... press ctrl-c to stop.      

```

> Server address: http://0.0.0.0:4000/
Once it is running, you can visit your site locally at [http://localhost:4000](http://localhost:4000).

As you make changes to the site, jekyll will detect them and update them realtime.

```terminal
Regenerating: 1 file(s) changed at 2022-02-17 08:02:23
                    _posts/2021-02-17-my-new-post.md
                    ...done in 3.214756529 seconds.
```

## Writing A New Post

Mostly following the advice from [chirpy - Writing a New Post](https://chirpy.cotes.page/posts/write-a-new-post/), install Jekyll-Compose and run one of the commands


`bundle exec jekyll post "My New Post" --timestamp-format "%Y-%m-%d %H:%M:%S %z"`

The post will be available now within `_posts`:
```terminal
bash-5.0# bundle exec jekyll post "These Are You First Steps" --timestamp-format "%Y-%m-%d %H:%M:%S %z"
Configuration file: /srv/jekyll/_config.yml
New post created at _posts/2022-02-17-these-are-you-first-steps.md
```

It will generate the post with some default YAML. Update your [_config.yml] with specific `jekyll-compose` settings as [suggested](https://github.com/jekyll/jekyll-compose#:~:text=Set%20default%20front%20matter%20for%20drafts%20and%20posts):

```yaml
jekyll_compose:
  default_front_matter:
    posts:
      description:
      image:
      category: [TOP_CATEGORIE, SUB_CATEGORIE]
      tags: blog
      mermaid: true
```

The new posts that you create will contain the default [YAML front matter](https://jekyllrb.com/docs/front-matter/) as specified by your config. 

---

## Credits

This site was built with:

- Engine: [Jekyll](https://jekyllrb.com/)
- Theme: [chirpy](https://github.com/cotes2020/jekyll-theme-chirpy/)
- Favicon Generation: [RealFaviconGenerator](https://realfavicongenerator.net/)

## Licenses

- This posts and content is published under [LICENSE](LICENSE)
- The chirpy Jekyll theme template and gem is published under [MIT](LICENSE.chirpy) License.
