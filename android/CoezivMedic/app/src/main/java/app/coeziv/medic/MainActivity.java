package app.coeziv.medic;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF0F172A);

        TextView splash = new TextView(this);
        splash.setText("COEZIV Medic\nSimulator O₂ & Apă Interfacială");
        splash.setTextColor(0xFFFFFFFF);
        splash.setTextSize(20);
        splash.setGravity(android.view.Gravity.CENTER);
        splash.setLineSpacing(6f, 1f);
        root.addView(splash, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        webView = new WebView(this);
        webView.setVisibility(View.INVISIBLE);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                return !url.startsWith("file:///android_asset/");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                injectMobileOptimizations(view);
                webView.setVisibility(View.VISIBLE);
                splash.setVisibility(View.GONE);
            }
        });

        webView.loadUrl("file:///android_asset/simulator_medic_premium_apa.html");
    }

    private void injectMobileOptimizations(WebView view) {
        String js = "(function(){" +
                "var m=document.querySelector('meta[name=viewport]');" +
                "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}" +
                "m.content='width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';" +
                "var s=document.createElement('style');" +
                "s.innerHTML='body{height:auto!important;min-height:100vh!important;overflow:auto!important;display:block!important;}'+" +
                "'.sidebar{position:sticky!important;top:0!important;z-index:20!important;width:100%!important;display:flex!important;flex-direction:row!important;gap:.5rem!important;overflow-x:auto!important;padding:.6rem!important;}'+" +
                "'.sidebar h2{display:none!important}.side-btn{white-space:nowrap!important;margin:0!important;min-width:max-content!important;}'+" +
                "'.main-area{display:block!important;overflow:visible!important;width:100%!important;}'+" +
                "'.topbar{height:auto!important;min-height:52px!important;padding:.7rem!important;gap:.5rem!important;align-items:flex-start!important;}'+" +
                "'.topbar-title{font-size:.95rem!important;line-height:1.25!important}.pdf-btn{display:none!important;}'+" +
                "'.content-wrap{padding:.65rem!important}.panel{border-radius:10px!important;padding:.9rem!important;margin:0 0 1rem!important;max-width:none!important;}'+" +
                "'#simulatorTab .sim-main{grid-template-columns:1fr!important;gap:.8rem!important;}'+" +
                "'#simulatorTab .card{padding:.9rem!important;border-radius:12px!important;}'+" +
                "'#simulatorTab .grid-2,#simulatorTab .grid-3{grid-template-columns:1fr!important;gap:.55rem!important;}'+" +
                "'#simulatorTab .result-row{align-items:flex-start!important;gap:.5rem!important;}'+" +
                "'#simulatorTab .result-value{white-space:normal!important;text-align:right!important;}'+" +
                "'input,select,button{font-size:16px!important;}';" +
                "document.head.appendChild(s);" +
                "})();";
        view.evaluateJavascript(js, null);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
