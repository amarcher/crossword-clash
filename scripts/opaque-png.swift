import CoreGraphics
import ImageIO
import Foundation

// Lossless RGB encoding for App Store artwork, which disallows an alpha channel.
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let source = CGImageSourceCreateWithURL(url as CFURL, nil)!
let input = CGImageSourceCreateImageAtIndex(source, 0, nil)!
let context = CGContext(data: nil, width: input.width, height: input.height,
    bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
context.draw(input, in: CGRect(x: 0, y: 0, width: input.width, height: input.height))
let output = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(output, context.makeImage()!, nil)
precondition(CGImageDestinationFinalize(output))
