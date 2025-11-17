I would like to add a new action type "snapshot" that will store the page content (HTML Source), cookies, localStorage, etc...  page content is stored by default, but cookies, localStorage, etc can be enabled by arguments. 

The snapshot action will create artifacts to 

#### `POST /api/v1/jobs`
Create a new automation job.

**Request Body:**
```json
{
  "browserTypeId": 1,
  "targetUrl": "https://iserter.com",
  "actions": [
    {"action": "fill", "target": "Your e-mail address", "getTargetBy": "getByLabel", "value": "user@example.com"},
    {"action": "fill", "target": "#password", "getTargetBy": "getBySelector", "value": "secret123"},
    {"action": "scroll", "target": "Submit", "getTargetBy": "getByText", "speed": 2000},
    {"action": "moveCursor", "target": "Submit", "getTargetBy": "getByText"},
    {"action": "click", "target": "Submit", "getTargetBy": "getByText", "waitForNavigation": true},
    {"action": "screenshot", "fullPage": true, "type": "png"}
  ],
  "timeout": 30000
}
```