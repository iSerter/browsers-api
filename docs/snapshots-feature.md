I would like to add a new action type "snapshot" that will store the page content (HTML Source), cookies, localStorage, etc...  page content is stored by default, but cookies, localStorage, etc can be enabled by arguments. 

The snapshot action will create artifacts. 
The snapshot action can be called multiple times within the "actions" flow. 

## Example: 

#### `POST /api/v1/jobs`
Create a new automation job.

**Request Body:**
```json
{
  "browserTypeId": 1,
  "targetUrl": "https://iserter.com",
  "actions": [
    {
      "action": "click",
      "target": "Contact",
      "getTargetBy": "getByText",
      "waitForNavigation": true
    },
    {
        "action": "snapshot",
    },
    {
      "action": "fill",
      "target": "Full Name",
      "getTargetBy": "getByPlaceholder",
      "value": "Ilyas Test"
    },
    {
      "action": "fill",
      "target": "Email Address",
      "getTargetBy": "getByPlaceholder",
      "value": "ilyas.serter+test@gmail.com"
    },
    {
      "action": "fill",
      "target": "Subject",
      "getTargetBy": "getByPlaceholder",
      "value": "lorem ipsum"
    },
    {
      "action": "moveCursor",
      "target": "Send message",
      "getTargetBy": "getByText"
    },
    {
        "action": "snapshot", "cookies": true, "localStorage": true
    },
    {"action": "screenshot", "fullPage": true, "type": "png"}
  ],
  "timeout": 30000
}
```