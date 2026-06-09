import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildShopifyInstallUrl } from "@/services/platformIntegration.service";

export async function GET(request: NextRequest) {
  try {
    const shop = request.nextUrl.searchParams.get("shop") ?? "";
    const state = randomBytes(24).toString("hex");
    const url = buildShopifyInstallUrl({ shop, state });
    const response = NextResponse.redirect(url);
    response.cookies.set("imp_shopify_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 10 * 60,
      path: "/"
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopify install failed";
    const fallback = new URL("/platform", request.url);
    fallback.searchParams.set("shopify_install_error", message);
    return NextResponse.redirect(fallback);
  }
}
