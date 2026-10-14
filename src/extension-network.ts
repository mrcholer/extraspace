import {BrowserRequestService} from '@codingame/monaco-vscode-base-service-override/vscode/vs/workbench/services/request/browser/requestService';
import {ExtensionResourceLoaderService} from '@codingame/monaco-vscode-extensions-service-override/vscode/vs/platform/extensionResourceLoader/browser/extensionResourceLoaderService';
import {IRequestService} from '@codingame/monaco-vscode-api/vscode/vs/platform/request/common/request.service';
import {IExtensionResourceLoaderService} from '@codingame/monaco-vscode-api/vscode/vs/platform/extensionResourceLoader/common/extensionResourceLoader.service';
import {SyncDescriptor} from '@codingame/monaco-vscode-api/vscode/vs/platform/instantiation/common/descriptors';
import type {IRequestOptions} from '@codingame/monaco-vscode-api/vscode/vs/base/parts/request/common/request';
import type {CancellationToken} from '@codingame/monaco-vscode-api/vscode/vs/base/common/cancellation';
import type {URI} from '@codingame/monaco-vscode-api/vscode/vs/base/common/uri';

function isOpenVSXResource(url:string) {
  try {const parsed=new URL(url);return parsed.protocol==='https:' && ['open-vsx.org','openvsx.eclipsecontent.org'].includes(parsed.hostname);}catch{return false;}
}
class OpenVSXRequestService extends BrowserRequestService {
  request(options:IRequestOptions,token:CancellationToken) {
    // Public asset GETs redirect to a CDN that accepts simple CORS requests but
    // does not accept VS Code's marketplace/client telemetry headers.
    if((options.type||'GET')==='GET' && options.url && isOpenVSXResource(options.url)) {
      const headers=Object.fromEntries(Object.entries(options.headers||{}).filter(([key])=>!/^(x-market-|x-client-|vscode-sessionid$|user-agent$)/i.test(key)));
      return super.request({...options,headers},token);
    }
    return super.request(options,token);
  }
}
class OpenVSXResourceLoader extends ExtensionResourceLoaderService {
  async readExtensionResource(uri:URI) {
    if(isOpenVSXResource(uri.toString(true))) {
      const response=await fetch(uri.toString(true));
      if(!response.ok)throw new Error(`Extension resource returned HTTP ${response.status}.`);
      return response.text();
    }
    return super.readExtensionResource(uri);
  }
}
export function getExtensionNetworkingOverride() {
  return {
    [IRequestService.toString()]:new SyncDescriptor(OpenVSXRequestService,[],true),
    [IExtensionResourceLoaderService.toString()]:new SyncDescriptor(OpenVSXResourceLoader,[],true)
  };
}
