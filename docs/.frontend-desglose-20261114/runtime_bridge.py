import json,time,os,sys
from pathlib import Path
from library_upload import LibraryUploadWorkflow,SignedUrlUploader
from library_file_transfer import LibraryFileMaterializer,LibraryFileTransferError
ROOT=Path(__file__).resolve().parent
class RuntimeBridge:
    def __init__(self): self.sequence=0
    def call_tool(self,connector,tool,arguments,**kwargs):
        self.sequence+=1
        stem=f"bridge_{self.sequence:03}"
        request=ROOT/(stem+"_request.json")
        response=ROOT/(stem+"_response.json")
        request.write_text(json.dumps({"tool":tool,"arguments":arguments}),encoding="utf-8")
        deadline=time.monotonic()+300
        while not response.exists():
            if time.monotonic()>deadline: raise RuntimeError("Runtime bridge response deadline")
            time.sleep(0.1)
        return json.loads(response.read_text(encoding="utf-8-sig"))
class WindowsMaterializer(LibraryFileMaterializer):
    def apply_xattrs(self,xattrs,path):
        if not hasattr(os,"setxattr"):
            raise LibraryFileTransferError("Extended attributes unavailable in Windows Python")
        return super().apply_xattrs(xattrs,path)
request=json.load(sys.stdin)
result=LibraryUploadWorkflow(apps_client=RuntimeBridge(),materializer=WindowsMaterializer(),uploader=SignedUrlUploader(),state_parent=ROOT).run(request)
(ROOT/"upload_bridge_result.json").write_text(json.dumps(result),encoding="utf-8")
print(json.dumps({"completed":True,"items":len(result["results"])}))

