import { NextRequest, NextResponse } from "next/server";
import { completeShopifyOAuthInstall } from "@/services/platformIntegration.service";

export async function GET(request: NextRequest) {
  const expectedState = request.cookies.get("imp_shopify_oauth_state")?.value;

  try {
    const result = await completeShopifyOAuthInstall({
      params: request.nextUrl.searchParams,
      expectedState,
      appUrl: process.env.APP_URL
    });
    const redirect = new URL("/platform", request.url);
    redirect.searchParams.set("shop", result.shop.shopifyDomain);
    redirect.searchParams.set("installed", "shopify");
    const response = NextResponse.redirect(redirect);
    response.cookies.delete("imp_shopify_oauth_state");
    return response;
  } catch (error) {
    const redirect = new URL("/platform", request.url);
    redirect.searchParams.set("shopify_install_error", error instanceof Error ? error.message : "Shopify OAuth callback failed");
    const response = NextResponse.redirect(redirect);
    response.cookies.delete("imp_shopify_oauth_state");
    return response;
  }
}
