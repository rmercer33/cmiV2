# Example Data Structure Tests

## Flat

* App icon and title
    Can we make this generic and have it specified in login.json or somewhere
    else?
        Yes, use frontend/public/info.json
        -- this works

* Site landing page customization
    * Landing pages can be built using MDX
      -- this works, details in /src/landing-pages

## Markdown

* Can we, should we include liquid templating or similar so we have more
  control over the html generated than offered by markdown?
    * Yes, markdown can be passed to handlebars templating engine

