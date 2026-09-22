import requests

try:
    res = requests.get("http://127.0.0.1:10000/api/v1/print-studio/jobs")
    print("Jobs response:", res.status_code, res.json())
    jobs = res.json().get("jobs", [])
    if jobs:
        jid = jobs[0]["id"]
        print(f"Calling print on job: {jid}")
        pres = requests.post(f"http://127.0.0.1:10000/api/v1/print-studio/jobs/{jid}/print")
        print("Print response status:", pres.status_code)
        print("Print response text:", pres.text)
except Exception as e:
    print(f"Error: {e}")
